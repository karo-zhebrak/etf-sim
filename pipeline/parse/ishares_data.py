"""Parser for the iShares fund data download.

The file is labelled .xls but is SpreadsheetML 2003 XML. Real files are not always valid
XML (bare "&" in "S&P", invalid UTF-8 bytes), so the bytes are cleaned before parsing.
"""

from __future__ import annotations

import datetime as dt
import re
import xml.etree.ElementTree as ET

from pipeline.common import ParseError, parse_date, parse_number, split_money, yes_no
from pipeline.models import (
    EtfFacts, Exposure, FactSnapshot, Holding, Listing, NavPrice, ParsedFile,
    PerformanceReturn, TotalReturnPoint,
)

SS = "urn:schemas-microsoft-com:office:spreadsheet"
NS = {"ss": SS}

ASSET_CLASS = {
    "equity": "equity", "fixed income": "fixed_income", "commodity": "commodity",
    "real estate": "property", "multi asset": "multi_asset",
}
USE_OF_INCOME = {"accumulating": "acc", "no income": "none", "distributing": "dist"}
EXPOSURE_SECTIONS = {
    "sector": "sector", "geography/locations": "country", "geography": "country",
    "location": "country", "locations": "country", "region": "region",
    "maturity": "maturity", "credit quality": "credit_quality", "asset class": "asset_class",
}
NOT_LOADED_SECTIONS = {"currency", "market cap"}  # known sections the schema does not model
BLOOMBERG_EXCHANGE ={"LN": "XLON", "NA": "XAMS", "GY": "XETR", "IM": "XMIL", "FP": "XPAR", "SW": "XSWX"}


def clean_xml(data: bytes) -> bytes:
    text = data.decode("utf-8", errors="replace")
    text = re.sub(r"&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)", "&amp;", text)
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", text)
    return text.encode("utf-8")


def read_sheets(data: bytes) -> dict[str, list[list[str]]]:
    """Return {sheet name: rows}, each row a list of cell strings with ss:Index gaps filled."""
    try:
        root = ET.fromstring(clean_xml(data))
    except ET.ParseError as e:
        raise ParseError(f"not SpreadsheetML XML: {e}") from e
    sheets: dict[str, list[list[str]]] = {}
    for ws in root.findall("ss:Worksheet", NS):
        rows = []
        for r in ws.findall("ss:Table/ss:Row", NS):
            row: list[str] = []
            for c in r.findall("ss:Cell", NS):
                idx = c.get(f"{{{SS}}}Index")
                if idx:
                    row.extend([""] * (int(idx) - 1 - len(row)))
                d = c.find("ss:Data", NS)
                row.append("" if d is None or d.text is None else d.text.strip())
            rows.append(row)
        sheets[ws.get(f"{{{SS}}}Name") or ""] = rows
    if not sheets:
        raise ParseError("no worksheets found")
    return sheets


def _nonempty(row: list[str]) -> list[str]:
    return [c for c in row if c]


def _row_date(row: list[str]) -> dt.date | None:
    for c in row:
        try:
            d = parse_date(c)
        except ParseError:
            continue
        if d:
            return d
    return None


def _label_values(rows: list[list[str]]) -> dict[str, tuple[str, dt.date | None]]:
    """Key Facts / Portfolio Characteristics: label, value, optional 'as of dd/Mon/yyyy'."""
    out = {}
    for row in rows:
        cells = _nonempty(row)
        if len(cells) < 2:
            continue
        as_of = None
        if len(cells) >= 3 and cells[2].lower().startswith("as of"):
            as_of = parse_date(cells[2][5:].strip())
        out[cells[0].strip()] = (cells[1], as_of)
    return out


def _first(d: dict, *keys):
    for k in keys:
        if k in d:
            return d[k]
    return (None, None)


def _period_label(header: str, section: str) -> str:
    h = " ".join(header.split())
    m = re.fullmatch(r"From (\S+) To (\S+)", h)
    if m:
        return f"{parse_date(m[1])}/{parse_date(m[2])}"
    if h.lower().startswith("incept"):
        return "since_inception"
    return h


def parse_performance(rows, isin, currency) -> list[PerformanceReturn]:
    sections = {"discrete": "discrete", "annualised": "annualised",
                "cumulative": "cumulative", "calendar year": "calendar"}
    out: list[PerformanceReturn] = []
    section = as_of = None
    header: list[str] | None = None
    fund: list[str] | None = None
    for row in rows:
        cells = _nonempty(row)
        if not cells:
            continue
        first = cells[0].strip().lower()
        if first in sections:
            section, as_of, header, fund = sections[first], _row_date(row), None, None
            continue
        if first == "as of":
            as_of, header, fund = _row_date(row), None, None
            continue
        if section is None:
            continue
        if row and row[0] == "" and len(cells) > 1 and first != "as of":
            header = row[1:]
            continue
        if first.startswith("total return"):
            fund = row[1:]
            continue
        if first.startswith("benchmark") and header and fund is not None:
            bench = row[1:]
            snap = as_of
            if section == "calendar":
                snap = dt.date(int(max(h for h in header if h.isdigit())), 12, 31)
            if snap is None:
                raise ParseError(f"performance section {section!r} has no as-of date")
            for i, h in enumerate(header):
                if not h:
                    continue
                out.append(PerformanceReturn(
                    isin=isin, as_of=snap, period_type=section,
                    period_label=_period_label(h, section),
                    fund_return=parse_number(fund[i]) if i < len(fund) else None,
                    benchmark_return=parse_number(bench[i]) if i < len(bench) else None,
                    currency=currency, source="data_file"))
            fund = None
    return out


def parse_series(rows, isin, currency) -> list[NavPrice]:
    out = []
    for row in rows:
        if len(row) < 2 or not row[0] or not row[1]:
            continue
        try:
            d = parse_date(row[0])
            v = parse_number(row[1])
        except ParseError:
            continue
        if d and v is not None:
            out.append(NavPrice(isin=isin, date=d, nav=v, currency=currency))
    return out


def parse_growth(rows, isin) -> list[TotalReturnPoint]:
    out = []
    for row in rows:
        if len(row) < 2 or not row[0]:
            continue
        try:
            d = parse_date(row[0])
        except ParseError:
            continue
        if not d:
            continue
        for series, idx in (("fund", 1), ("benchmark", 2)):
            v = parse_number(row[idx]) if idx < len(row) else None
            if v is not None:
                out.append(TotalReturnPoint(isin=isin, series=series, date=d, value=v))
    return out


def parse_exposures(rows, isin, warnings) -> list[Exposure]:
    out = []
    kind = as_of = None
    in_data = False
    for i, row in enumerate(rows):
        cells = _nonempty(row)
        if not cells:
            in_data = False
            continue
        first = cells[0].strip()
        if len(cells) == 1 and first.lower() in EXPOSURE_SECTIONS:
            kind, as_of, in_data = EXPOSURE_SECTIONS[first.lower()], None, False
            continue
        nxt = _nonempty(rows[i + 1]) if i + 1 < len(rows) else []
        if len(cells) == 1 and nxt and nxt[0].strip().lower() == "as of":
            if first.lower() not in NOT_LOADED_SECTIONS:
                warnings.append(f"unknown exposure section {first!r} skipped")
            kind, in_data = None, False
            continue
        if first.lower() == "as of":
            as_of = _row_date(row)
            continue
        if first.lower() == "type":
            in_data = kind is not None
            continue
        if len(cells) == 1 and in_data:  # footnote ends the section
            in_data = False
            continue
        if in_data and len(cells) >= 2:
            try:
                w = parse_number(cells[1])
            except ParseError:
                in_data = False
                continue
            if as_of is None:
                raise ParseError(f"exposure section {kind!r} has no as-of date")
            out.append(Exposure(isin=isin, as_of=as_of, kind=kind, label=first, weight=w or 0.0,
                                iso_code=cells[2] if len(cells) > 2 and re.fullmatch(r"[A-Z]{2}", cells[2]) else None))
    return out


def parse_holdings(rows, isin) -> list[Holding]:
    if not rows:
        return []
    kind = (_nonempty(rows[0]) or [""])[0].strip().lower()
    as_of = None
    header: list[str] | None = None
    out = []
    for row in rows[1:]:
        cells = _nonempty(row)
        if not cells:
            if header:
                break
            continue
        if cells[0].lower() == "as of":
            as_of = _row_date(row)
            continue
        if header is None:
            header = [h.strip().lower() for h in row]
            continue
        if len(cells) == 1:  # disclaimer row ends the table
            break
        rec = {header[i]: row[i] for i in range(min(len(header), len(row)))}
        if as_of is None:
            raise ParseError("holdings sheet has no as-of date")
        mv_ccy, mv = split_money(rec.get("market value"))
        out.append(Holding(
            isin=isin, as_of=as_of, rank=len(out) + 1,
            name=rec.get("name") or rec.get("issuer") or "",
            issuer_ticker=rec.get("issuer ticker") or None,
            sector=rec.get("sector") or None,
            asset_class=rec.get("asset class") or None,
            country=rec.get("location") or None,
            weight=parse_number(rec.get("weight (%)")),
            market_value=mv,
            currency=rec.get("market currency") or mv_ccy,
            is_partial=kind != "all",
        ))
    return out


def _replication(structure: str | None, methodology: str | None) -> str | None:
    s, m = (structure or "").lower(), (methodology or "").lower()
    if "synthetic" in s:
        return "synthetic"
    if "physical" in s:
        return "physical_sampled" if m in {"optimised", "sampled", "optimized"} else "physical"
    return None


def parse_ishares_fund_data(data: bytes, isin: str) -> ParsedFile:
    sheets = read_sheets(data)
    warnings: list[str] = []
    expected = ["Fund Header", "Performance Returns", "Historical NAVs", "Growth of Hypothetical 10,000",
                "Key Facts", "Portfolio Characteristics", "Exposure Breakdowns", "Holdings"]
    for name in expected:
        if name not in sheets:
            warnings.append(f"missing sheet {name!r}")

    kf = _label_values(sheets.get("Key Facts", []))
    pc = _label_values(sheets.get("Portfolio Characteristics", []))
    file_isin = _first(kf, "ISIN")[0]
    if file_isin is None:
        raise ParseError("Key Facts has no ISIN")
    if file_isin.strip().upper() != isin:
        raise ParseError(f"ISIN mismatch: file has {file_isin}, config has {isin}")

    header = sheets.get("Fund Header", [])
    name = (_nonempty(header[0]) or [None])[0] if header else None
    base_ccy = _first(kf, "Fund Base Currency", "Base Currency")[0]
    share_ccy = _first(kf, "Share Class Currency")[0] or base_ccy
    bbg = _first(kf, "Bloomberg Ticker")[0]
    ticker = exch = None
    if bbg and " " in bbg.strip():
        ticker, code = bbg.strip().split(None, 1)
        exch = BLOOMBERG_EXCHANGE.get(code.strip())
    if not ticker or exch != "XLON":
        warnings.append(f"no London ticker in file (Bloomberg Ticker {bbg!r}); primary ticker left empty")
        ticker = None if exch != "XLON" else ticker
    bench_key = _first(pc, "Benchmark Ticker", "Index Ticker")[0]
    use = (_first(kf, "Use of Income")[0] or "").strip().lower()
    asset = (_first(kf, "Asset Class")[0] or "").strip().lower()
    if use and use not in USE_OF_INCOME:
        warnings.append(f"unknown Use of Income {use!r}")
    if asset and asset not in ASSET_CLASS:
        warnings.append(f"unknown Asset Class {asset!r}")

    facts = EtfFacts(
        isin=isin, name=name, primary_ticker=ticker,
        share_class_currency=share_ccy, base_currency=base_ccy,
        domicile=_first(kf, "Domicile")[0],
        benchmark_index=_first(kf, "Benchmark Index", "Index")[0],
        benchmark_key=bench_key if bench_key and bench_key != "-" else None,
        distribution=USE_OF_INCOME.get(use),
        replication=_replication(_first(kf, "Product Structure")[0], _first(kf, "Methodology")[0]),
        asset_class=ASSET_CLASS.get(asset),
        inception_date=parse_date(_first(kf, "Share Class Launch Date", "Inception Date", "Fund Launch Date")[0]),
        fund_launch_date=parse_date(_first(kf, "Fund Launch Date")[0]),
        isa_eligible=yes_no(_first(kf, "ISA Eligibility")[0]),
        uk_reporting=yes_no(_first(kf, "UK Reporting Status")[0]),
    )
    listings = [Listing(isin=isin, exchange=exch, ticker=ticker)] if ticker else []

    na_val, na_asof = _first(kf, "Net Assets of Share Class", "Net Assets")
    if na_val is None:
        na_val, na_asof = _first(kf, "Net Assets of Fund")
    na_ccy, na = split_money(na_val)
    snap_asof = na_asof or _first(kf, "Shares Outstanding")[1]
    snapshots = []
    if snap_asof:
        extra = {}
        for label in ("Weighted Avg Coupon", "Tonnes in Trust", "Daily Metal Entitlement per Security",
                      "Securities Lending Return"):
            v = _first(kf, label)[0] or _first(pc, label)[0]
            if v is not None:
                extra[label] = parse_number(v)
        nh = parse_number(_first(pc, "Number of Holdings")[0])
        snapshots.append(FactSnapshot(
            isin=isin, as_of=snap_asof,
            ter=parse_number(_first(kf, "Total Expense Ratio")[0]),
            net_assets=na, net_assets_currency=na_ccy,
            shares_outstanding=parse_number(_first(kf, "Shares Outstanding")[0]),
            n_holdings=int(nh) if nh is not None else None,
            pe=parse_number(_first(pc, "P/E Ratio")[0]),
            pb=parse_number(_first(pc, "P/B Ratio")[0]),
            std_3y=parse_number(_first(pc, "Standard Deviation (3y)")[0]),
            beta_3y=parse_number(_first(pc, "3y Beta")[0]),
            yield_to_maturity=parse_number(_first(pc, "Weighted Average YTM")[0]),
            effective_duration=parse_number(_first(pc, "Effective Duration")[0]),
            weighted_avg_maturity=parse_number(_first(pc, "Weighted Avg Maturity")[0]),
            ounces_in_trust=parse_number(_first(kf, "Ounces in Trust")[0]),
            extra=extra,
        ))
    else:
        warnings.append("no as-of date for fund facts; snapshot skipped")

    nav = parse_series(sheets.get("Historical NAVs", [])[1:], isin, share_ccy) if share_ccy else []
    if not share_ccy:
        warnings.append("no share class currency; NAVs skipped")
    return ParsedFile(
        isin=isin, facts=facts, listings=listings, snapshots=snapshots,
        performance=parse_performance(sheets.get("Performance Returns", []), isin, share_ccy),
        exposures=parse_exposures(sheets.get("Exposure Breakdowns", []), isin, warnings),
        holdings=parse_holdings(sheets.get("Holdings", []), isin),
        nav=nav,
        total_return=parse_growth(sheets.get("Growth of Hypothetical 10,000", [])[1:], isin),
        warnings=warnings,
    )
