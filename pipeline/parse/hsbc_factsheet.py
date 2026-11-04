"""HSBC monthly factsheet PDF: the main source of HSBC fund facts, returns, allocations,
top 10 holdings and listings.

Layouts differ between equity and bond funds, so parsing works line by line on the
extracted text with tolerant patterns, and anything not recognised becomes a warning.
"""

from __future__ import annotations

import datetime as dt
import re

from pipeline.common import ParseError, parse_date, parse_number, yes_no
from pipeline.labels import Mappings, known_labels
from pipeline.models import (
    EtfFacts, Exposure, FactSnapshot, Holding, Listing, ParsedFile, PerformanceReturn,
)
from pipeline.parse.pdf_text import extract, section

NUM = r"-?\d[\d,]*\.?\d*"
BBG_MIC = {"LN": "XLON", "SW": "XSWX", "FP": "XPAR", "GY": "XETR", "GR": "XFRA", "IM": "XMIL",
           "NA": "XAMS", "MM": "XMEX", "SM": "XMAD"}
ALLOCATION_KINDS = [
    (re.compile(r"^Sector allocation"), "sector"),
    (re.compile(r"^Geographical allocation"), "country"),
    (re.compile(r"^Country allocation"), "country"),
    (re.compile(r"^Region(?:al)? allocation"), "region"),
    (re.compile(r"^Asset allocation"), "asset_class"),
    (re.compile(r"^Credit rating"), "credit_quality"),
]
SKIPPED_TABLES = re.compile(r"^(Currency Allocation|Maturity Breakdown)")
RATING = re.compile(r"^(AAA|AA[+-]?|A[+-]?|BBB[+-]?|BB[+-]?|B[+-]?|CCC.*|Not Rated|NR|Cash)$", re.I)
PERIODS = {"ytd": ("cumulative", "ytd"), "1 month": ("cumulative", "1m"), "3 months": ("cumulative", "3m"),
           "6 months": ("cumulative", "6m"), "1 year": ("cumulative", "1y")}


def _nums(s: str) -> list[float | None]:
    return [None if t == "--" else parse_number(t) for t in re.findall(r"--|" + NUM, s)]


def _fact(text: str, label: str, value: str = r"(.+?)") -> str | None:
    m = re.search(rf"(?:^|\s){label}\S*\s+{value}\s*$", text, re.M)
    return m[1].strip() if m else None


def _performance(lines, isin, as_of, currency, warnings) -> list[PerformanceReturn]:
    out: list[PerformanceReturn] = []
    for i, line in enumerate(lines):
        if line.startswith("Performance (%)"):
            tokens = re.findall(r"YTD|\d+ months?|\d+ years?(?: ann)?|ann\b", line[len("Performance (%)"):])
            labels = []
            for t in tokens:
                if t == "ann":
                    labels.append(("annualised", "since_inception"))
                elif t.endswith(" ann"):
                    labels.append(("annualised", f"{t.split()[0]}y"))
                else:
                    labels.append(PERIODS.get(t.lower(), ("cumulative", t)))
            fund = next((l for l in lines[i + 1:i + 4] if l.startswith("Fund ")), None)
            bench = next((l for l in lines[i + 1:i + 4] if l.startswith("Reference Benchmark ")), None)
            fv = _nums(fund[5:]) if fund else []
            bv = _nums(bench[len("Reference Benchmark "):]) if bench else []
            if len(fv) != len(labels):
                warnings.append(f"factsheet performance: {len(labels)} periods but {len(fv)} fund values; skipped")
                continue
            for j, (ptype, plabel) in enumerate(labels):
                out.append(PerformanceReturn(isin=isin, as_of=as_of, period_type=ptype, period_label=plabel,
                                             fund_return=fv[j], benchmark_return=bv[j] if j < len(bv) else None,
                                             currency=currency, source="factsheet"))
        if "Rolling performance" in line:
            window = " ".join(lines[max(0, i - 1):i + 2])
            starts = re.findall(r"(\d{2}/\d{2}/\d{2})-", window)
            ends = re.findall(r"(?<![\d/])(\d{2}/\d{2}/\d{2})(?![-\d])", window)
            fund = next((l for l in lines[i + 1:i + 4] if l.startswith("Fund ")), None)
            bench = next((l for l in lines[i + 1:i + 4] if l.startswith("Reference Benchmark ")), None)
            fv = _nums(fund[5:]) if fund else []
            bv = _nums(bench[len("Reference Benchmark "):]) if bench else []
            if not starts or len(starts) != len(ends) or len(fv) != len(starts):
                warnings.append("factsheet rolling performance not recognised; skipped")
                continue
            for j, (s, e) in enumerate(zip(starts, ends)):
                if fv[j] is None and (j >= len(bv) or bv[j] is None):
                    continue
                out.append(PerformanceReturn(isin=isin, as_of=as_of, period_type="discrete",
                                             period_label=f"{parse_date(s)}/{parse_date(e)}",
                                             fund_return=fv[j], benchmark_return=bv[j] if j < len(bv) else None,
                                             currency=currency, source="factsheet"))
    return out


def _allocations(lines, isin, as_of, warnings) -> list[Exposure]:
    out: list[Exposure] = []
    kind = None
    for line in lines:
        hit = next((k for rx, k in ALLOCATION_KINDS if rx.search(line)), None)
        if hit:
            kind = hit
            continue
        if SKIPPED_TABLES.search(line):
            kind = None
            continue
        if kind is None:
            continue
        # "<label> <fund> [<benchmark> [<relative>]] [text from a neighbouring column]"
        m = re.match(rf"^(.*?[A-Za-z&)].*?)\s+({NUM}|--)(?:\s+(?:{NUM}|--))*(?:\s+\D.*)?$", line)
        if not m:
            if re.fullmatch(NUM, line.strip()):  # benchmark value printed on its own line
                continue
            if kind == "credit_quality" and re.match(r"^\S+ \d", line) is None:
                continue  # interleaved text from a neighbouring column
            kind = None
            continue
        label, w = m[1].strip(), m[2]
        if label.startswith("Source:"):
            kind = None
            continue
        if kind == "credit_quality" and not RATING.match(label):
            continue  # neighbouring Maturity Breakdown column
        if label.lower() in {"total", "fund", "reference benchmark"} or w == "--":
            continue
        out.append(Exposure(isin=isin, as_of=as_of, kind=kind, label=label, weight=parse_number(w)))
    return out


def _top10(lines, isin, as_of, m: Mappings) -> list[Holding]:
    start = next((i for i, l in enumerate(lines) if l.startswith("Top 10 holdings") and "Weight" in l), None)
    if start is None:
        return []
    has_sector, has_location = "Sector" in lines[start], "Location" in lines[start]
    sectors, countries = known_labels(m, "sector"), known_labels(m, "country")
    out = []
    for line in lines[start + 1:start + 11]:
        mm = re.match(rf"^(.*\S)\s+({NUM})$", line)
        if not mm:
            break
        rest, sector, country = mm[1], None, None
        if has_sector:
            low = rest.lower()
            sector = next((s for s in sectors if low.endswith(" " + s)), None)
            if sector:
                sector, rest = rest[-len(sector):], rest[:-len(sector)].rstrip()
        if has_location:
            low = rest.lower()
            country = next((c for c in countries if low.endswith(" " + c)), None)
            if country:
                country, rest = rest[-len(country):], rest[:-len(country)].rstrip()
        out.append(Holding(isin=isin, as_of=as_of, rank=len(out) + 1, name=rest, sector=sector,
                           country=country, weight=parse_number(mm[2]), is_partial=True))
    return out


def _listings(lines, isin) -> list[Listing]:
    out, seen = [], set()
    for line in lines:
        # "<exchange> [<listing date>] <ccy> <hours or --> <ticker> <bbg exchange code> ..."
        mm = re.search(r"\s([A-Z]{3})\s+(?:\d{2}:\d{2}\s*-\s*\d{2}:\d{2}|--)\s+([A-Z0-9]{2,6}) (LN|SW|FP|GY|GR|IM|NA|MM|SM)\s",
                       line + " ")
        if not mm or not re.search(r"EXCHANGE|BOERSE|BORSA|EURONEXT|BIVA|BOLSA", line):
            continue
        key = (BBG_MIC[mm[3]], mm[2])
        if key not in seen:
            seen.add(key)
            out.append(Listing(isin=isin, exchange=key[0], ticker=key[1], trading_currency=mm[1]))
    return out


def parse_hsbc_factsheet_text(pages: list[str], left: str, right: str, isin: str, mappings: Mappings) -> ParsedFile:
    warnings: list[str] = []
    full = "\n".join(pages)
    p1 = pages[0]
    lines = [l.strip() for l in full.splitlines() if l.strip()]

    file_isin = _fact(p1, "ISIN", r"([A-Z]{2}[A-Z0-9]{9}\d)")
    if not file_isin:
        raise ParseError("factsheet has no ISIN")
    if file_isin != isin:
        raise ParseError(f"ISIN mismatch: factsheet has {file_isin}, config has {isin}")
    m = re.search(r"data as at (\d{1,2} \w+ \d{4})", full) or re.search(r"Monthly report\s*(\d{1,2} \w+ \d{4})", full)
    if not m:
        raise ParseError("factsheet has no report date")
    as_of: dt.date = parse_date(m[1])

    share_ccy = _fact(p1, "Share class base currency", r"([A-Z]{3})")
    treatment = (_fact(p1, "Dividend treatment", r"(\w+)") or "").lower()
    replication = (_fact(p1, "Replication method", r"(\S+)") or "").lower()
    strategy = section(left, "Investment strategy", "Main risks") or ""
    if replication.startswith("physical-full") or replication == "physical":
        repl = "physical"
    elif replication.startswith("physical"):
        repl = "physical_sampled"
    elif "synthetic" in replication or "swap" in replication:
        repl = "synthetic"
    elif "optimisation" in strategy.lower() or "sampling" in strategy.lower():
        repl = "physical_sampled"
    elif "full replication" in strategy.lower() or "replicat" in strategy.lower():
        repl = "physical"
    else:
        repl = None
    bench = None
    bm = re.search(r"Reference\s+(.*?)\n(?:Managers|Fund manager|Replication method|Fees and expenses|SIPP eligible|Fund facts)",
                   right, re.S)
    if bm:
        bench = " ".join(w for w in bm[1].split() if w != "benchmark")
    header = re.search(r"\|\s*([A-Z0-9]+) (LN|SW|FP|GY|IM)\s*\|\s*([A-Z]{3})", p1)
    listings = _listings(lines, isin)
    gbp_lse = next((l.ticker for l in listings if l.exchange == "XLON" and l.trading_currency == "GBP"), None)
    asset = "fixed_income" if "Fixed Income Characteristics" in full else ("equity" if "Equity characteristics" in full else None)
    title = section(p1, "HSBC ETFs PLC", "Marketing communication")
    description = section(left, "Investment objective", "Investment strategy")
    if not description:
        warnings.append("factsheet: no investment objective text found")

    facts = EtfFacts(
        isin=isin, name=title, primary_ticker=gbp_lse or (header[1] if header else None),
        share_class_currency=share_ccy, base_currency=_fact(p1, "Fund base currency", r"([A-Z]{3})"),
        domicile=_fact(p1, "Domicile", r"(\w+)"), benchmark_index=bench,
        benchmark_key=_fact(full, "TR Index Bloomberg Ticker", r"(\S+)"),
        distribution={"accumulating": "acc", "distributing": "dist"}.get(treatment),
        replication=repl, asset_class=asset,
        inception_date=parse_date(_fact(p1, "Inception date", r"(\d{1,2} \w+ \d{4})")),
        description=description,
        isa_eligible=yes_no(_fact(p1, "ISA eligible", r"(Yes|No)")),
        uk_reporting=yes_no(_fact(p1, "UK reporting fund status", r"(Yes|No)")),
    )
    size = re.search(r"Fund size ([A-Z]{3}) ([\d,]+)", p1)
    holdings_line = re.search(r"No\. of holdings ex cash ([\d,]+)", full)
    extra = {}
    for label, key in (("Average coupon rate", "average_coupon"), ("Yield to worst", "yield_to_worst"),
                       ("Modified duration to worst", "modified_duration_to_worst"),
                       ("Average market cap \\(USD Mil\\)", "avg_market_cap_usd_m"),
                       ("Tracking error 3 years", "tracking_error_3y")):
        mm = re.search(rf"{label}\s+({NUM})", full)
        if mm:
            extra[key] = parse_number(mm[1])
    vol = re.search(r"3-Year Risk Measures.*?\nVolatility\s+(--|" + NUM + ")", full, re.S)

    def first_num(pattern):
        mm = re.search(pattern + r"\s+(" + NUM + ")", full)
        return parse_number(mm[1]) if mm else None

    snapshot = FactSnapshot(
        isin=isin, as_of=as_of,
        ter=parse_number(_fact(p1, "Ongoing charge figure", rf"({NUM})%")),
        net_assets=parse_number(size[2]) if size else None,
        net_assets_currency=size[1] if size else None,
        shares_outstanding=parse_number(_fact(p1, "Shares outstanding", r"([\d,]+)")),
        n_holdings=int(parse_number(holdings_line[1])) if holdings_line else None,
        pe=first_num(r"Price/earning ratio"),
        std_3y=parse_number(vol[1]) if vol and vol[1] != "--" else None,
        yield_to_maturity=parse_number(_fact(p1, "Yield to maturity", rf"({NUM})%")),
        effective_duration=first_num(r"Option adjusted duration"),
        weighted_avg_maturity=first_num(r"Average maturity"),
        extra=extra,
    )
    exposures = _allocations(lines, isin, as_of, warnings)
    if not exposures:
        warnings.append("factsheet: no allocation tables found")
    return ParsedFile(
        isin=isin, facts=facts, listings=listings, snapshots=[snapshot],
        performance=_performance(lines, isin, as_of, share_ccy, warnings),
        exposures=exposures, holdings=_top10(lines, isin, as_of, mappings), warnings=warnings,
    )


def parse_hsbc_factsheet(data: bytes, isin: str, mappings: Mappings) -> ParsedFile:
    pages, left, right = extract(data, split_heading="Share class details")
    return parse_hsbc_factsheet_text(pages, left, right, isin, mappings)
