"""HSBC factsheet parsing, on synthetic extracted text that copies the real two-column layout."""

import datetime as dt

import pytest

from pipeline.common import ParseError
from pipeline.parse.hsbc_factsheet import parse_hsbc_factsheet_text

from .conftest import ISIN

P1 = f"""HSBC ETFs PLC
HSBC TEST WORLD UCITS ETF
Marketing communication | Monthly report 30 September 2026 | HTST LN | USD
Share class details
Investment objective
Key metrics
The Fund aims to track the Test World Index. NAV per share USD 20.00
Performance 1 month -1.50%
Fund facts
UK reporting fund status Yes
ISA eligible Yes
Dividend treatment Accumulating
Fund base currency USD
Share class base currency USD
Domicile Ireland
Inception date 8 December 2020
Shares outstanding 1,000,000
Fund size USD 20,000,000
Replication method Physical-Sample
Fees and expenses
Ongoing charge figure² 0.150%
Codes
ISIN {ISIN}
Source: HSBC Asset Management, data as at 30 September 2026"""
LEFT = """Investment objective
The Fund aims to track the Test World Index.
Investment strategy
The Fund uses optimisation.
Main risks"""
RIGHT = """Reference 100% Test World
benchmark Net
Replication method Physical-Sample"""
P2 = """Performance (%) YTD 1 month 3 months 6 months 1 year 3 years ann 5 years ann 10 years ann
Fund 11.78 -1.55 1.89 15.95 15.29 21.50 12.02 --
Reference Benchmark 11.75 -1.55 1.88 15.89 15.24 21.40 11.89 --
Rolling performance 30/09/25- 30/09/24-
(%) 30/09/26 30/09/25
Fund 15.29 17.33
Reference Benchmark 15.24 17.25
Equity characteristics Fund Benchmark
No. of holdings ex cash 1,222 1,238
Price/earning ratio 22.52 22.56
TR Index Bloomberg Ticker TESTIDX
Sector allocation (%)
Information Technology 60.00
Communication Services 39.50
Cash & Others 0.50
Fund"""
P3 = """Geographical allocation (%)
United States 70.00
Japan 30.00
Fund
Top 10 holdings Location Sector Weight (%)
Alpha Corp United States Information Technology 5.78
Beta & Co Japan Communication Services 2.00
Top 10 holdings exclude holdings in cash.
LONDON STOCK EXCHANGE 10 Dec 2020 USD 08:00 -16:30 HTST LN HTST.L X Y
LONDON STOCK EXCHANGE 10 Dec 2020 GBP 08:00 -16:30 HTSG LN HTSG.L X Y
BORSA ITALIANA SPA 14 Jun 2021 EUR 09:00 -17:35 HTST IM HTST.MI X Y
Source: HSBC Asset Management, data as at 30 September 2026"""


def parse(mappings, pages=None):
    return parse_hsbc_factsheet_text(pages or [P1, P2, P3], LEFT, RIGHT, ISIN, mappings)


def test_facts(mappings):
    p = parse(mappings)
    f = p.facts
    assert f.name == "HSBC TEST WORLD UCITS ETF"
    assert (f.distribution, f.replication, f.asset_class) == ("acc", "physical_sampled", "equity")
    assert (f.share_class_currency, f.primary_ticker, f.benchmark_key) == ("USD", "HTSG", "TESTIDX")
    assert f.benchmark_index == "100% Test World Net"
    assert f.inception_date == dt.date(2020, 12, 8)
    assert f.description == "The Fund aims to track the Test World Index."
    s = p.snapshots[0]
    assert (s.as_of, s.ter, s.net_assets, s.shares_outstanding, s.n_holdings, s.pe) == (
        dt.date(2026, 9, 30), 0.15, 20_000_000.0, 1_000_000.0, 1222, 22.52)


def test_listings_currency_and_mic(mappings):
    got = [(l.exchange, l.ticker, l.trading_currency) for l in parse(mappings).listings]
    assert got == [("XLON", "HTST", "USD"), ("XLON", "HTSG", "GBP"), ("XMIL", "HTST", "EUR")]


def test_performance(mappings):
    by = {(r.period_type, r.period_label): r for r in parse(mappings).performance}
    assert by[("cumulative", "ytd")].fund_return == 11.78
    assert by[("annualised", "3y")].benchmark_return == 21.40
    assert by[("annualised", "10y")].fund_return is None
    assert by[("discrete", "2024-09-30/2025-09-30")].fund_return == 17.33
    assert all(r.source == "factsheet" for r in by.values())


def test_allocations_and_top10(mappings):
    p = parse(mappings)
    assert {(e.kind, e.label): e.weight for e in p.exposures} == {
        ("sector", "Information Technology"): 60.0, ("sector", "Communication Services"): 39.5,
        ("sector", "Cash & Others"): 0.5, ("country", "United States"): 70.0, ("country", "Japan"): 30.0}
    assert [(h.name, h.country, h.sector, h.weight, h.is_partial) for h in p.holdings] == [
        ("Alpha Corp", "United States", "Information Technology", 5.78, True),
        ("Beta & Co", "Japan", "Communication Services", 2.0, True)]


BOND_P2 = """Since inception
Performance (%) YTD 1 month 1 year 3 years ann ann
Fund -0.24 -1.12 0.12 3.97 0.52
Reference Benchmark -0.23 -1.09 0.17 4.14 0.71
Fixed Income Characteristics Fund Benchmark Relative
No. of holdings ex cash 315 6,479 --
Option adjusted duration 1.87 1.88 0.00
Average maturity 1.97 1.97 0.00
Credit rating (%) Fund Benchmark Relative (Option adjusted Reference
AAA 60.00 16.21 0.31 duration) Fund Benchmark Relative
0 -6months 0.00 0.00 0.00
AA 40.00 43.80 0.07
Total 1.87 1.88 0.00
Currency Allocation Reference
USD 47.92 49.09 -1.17
Sector allocation (%) Fund Benchmark Relative
Treasuries 90.00 69.54 -0.55
Technology 10.00 1.03 0.02
Source: HSBC Asset Management, data as at 30 September 2026"""


def test_bond_layout(mappings):
    p = parse(mappings, [P1.replace("Replication method Physical-Sample\n", ""), BOND_P2])
    assert p.facts.asset_class == "fixed_income"
    assert {(e.kind, e.label): e.weight for e in p.exposures} == {
        ("credit_quality", "AAA"): 60.0, ("credit_quality", "AA"): 40.0,
        ("sector", "Treasuries"): 90.0, ("sector", "Technology"): 10.0}
    by = {(r.period_type, r.period_label): r.fund_return for r in p.performance}
    assert by[("annualised", "since_inception")] == 0.52
    s = p.snapshots[0]
    assert (s.effective_duration, s.weighted_avg_maturity, s.n_holdings) == (1.87, 1.97, 315)


def test_isin_mismatch(mappings):
    with pytest.raises(ParseError, match="ISIN mismatch"):
        parse_hsbc_factsheet_text([P1, P2, P3], LEFT, RIGHT, "IE00BXXXXXX0", mappings)
