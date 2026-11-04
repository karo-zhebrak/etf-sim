import datetime as dt

import pytest

from pipeline.common import ParseError
from pipeline.parse.ishares_data import parse_ishares_fund_data

from .conftest import ISIN, ishares_sheets, spreadsheetml


def test_facts_and_listing(ishares_file):
    p = parse_ishares_fund_data(ishares_file, ISIN)
    f = p.facts
    assert f.name == "iShares Test S&P World UCITS ETF"   # bare & survived cleaning
    assert (f.primary_ticker, f.share_class_currency, f.distribution) == ("TEST", "USD", "acc")
    assert (f.replication, f.asset_class, f.benchmark_key) == ("physical_sampled", "equity", "TESTIDX")
    assert f.inception_date == dt.date(2009, 9, 25)
    assert f.isa_eligible is True
    assert [(l.exchange, l.ticker) for l in p.listings] == [("XLON", "TEST")]


def test_snapshot(ishares_file):
    s = parse_ishares_fund_data(ishares_file, ISIN).snapshots[0]
    assert s.as_of == dt.date(2026, 11, 2)
    assert (s.ter, s.net_assets, s.net_assets_currency) == (0.20, 1234567.0, "USD")
    assert (s.n_holdings, s.pe, s.pb, s.std_3y, s.beta_3y) == (3, 20.0, 3.0, 11.0, 1.0)


def test_performance(ishares_file):
    perf = parse_ishares_fund_data(ishares_file, ISIN).performance
    by = {(r.period_type, r.period_label): r for r in perf}
    assert by[("discrete", "2025-09-30/2026-09-30")].fund_return == 5.0
    assert by[("annualised", "since_inception")].benchmark_return == 5.9
    assert by[("cumulative", "1m")].fund_return == -1.0
    cal = by[("calendar", "2025")]
    assert (cal.fund_return, cal.as_of) == (12.0, dt.date(2025, 12, 31))
    assert all(r.as_of == dt.date(2026, 9, 30) for r in perf if r.period_type != "calendar")
    assert all(r.source == "data_file" and r.currency == "USD" for r in perf)


def test_series(ishares_file):
    p = parse_ishares_fund_data(ishares_file, ISIN)
    assert len(p.nav) == 3 and p.nav[0].nav == 10.5 and p.nav[0].currency == "USD"
    bench = sorted((t for t in p.total_return if t.series == "benchmark"), key=lambda t: t.date)
    assert [t.value for t in bench][:3] == [10000.0, 14600.0, 10030.0]   # glitch is parsed; validation flags it


def test_exposures_and_holdings(ishares_file):
    p = parse_ishares_fund_data(ishares_file, ISIN)
    sectors = {e.label: e.weight for e in p.exposures if e.kind == "sector"}
    assert sectors == {"Information Technology": 60.0, "Communication": 39.5, "Cash and/or Derivatives": 0.5}
    countries = {e.label: e.iso_code for e in p.exposures if e.kind == "country"}
    assert countries == {"United States": "US", "Japan": "JP"}
    assert [h.name for h in p.holdings] == ["ALPHA CORP", "BETA & SONS", "USD CASH"]
    assert p.holdings[0].market_value == 600.0 and not p.holdings[0].is_partial
    assert p.warnings == []


def test_isin_mismatch_fails(ishares_file):
    with pytest.raises(ParseError, match="ISIN mismatch"):
        parse_ishares_fund_data(ishares_file, "IE00BXXXXXX0")


def test_missing_sheets_are_reported():
    sheets = ishares_sheets()
    for name in ("Holdings", "Exposure Breakdowns", "Growth of Hypothetical 10,000"):
        del sheets[name]
    p = parse_ishares_fund_data(spreadsheetml(sheets), ISIN)
    assert p.holdings == [] and p.exposures == [] and p.total_return == []
    assert "missing sheet 'Holdings'" in p.warnings


def test_bond_style_sections():
    sheets = ishares_sheets()
    sheets["Exposure Breakdowns"] = [
        ["Maturity"], ["as of", "30/Oct/2026"], ["Type", "Fund", ""], ["0 - 1 Years", "40.00"], ["20+ Years", "60.00"],
        ["Credit Quality"], ["as of", "30/Oct/2026"], ["Type", "Fund", ""], ["AA Rated", "100.00"],
    ]
    sheets["Holdings"] = [["Top Issuers"], ["as of", "30/Oct/2026"], ["Issuer", "Weight (%)"],
                          ["UK CONV GILT", "100.00"], ["Preliminary holdings note"]]
    p = parse_ishares_fund_data(spreadsheetml(sheets), ISIN)
    assert {(e.kind, e.label) for e in p.exposures} == {
        ("maturity", "0 - 1 Years"), ("maturity", "20+ Years"), ("credit_quality", "AA Rated")}
    assert p.holdings[0].name == "UK CONV GILT" and p.holdings[0].is_partial


def test_not_xml():
    with pytest.raises(ParseError):
        parse_ishares_fund_data(b"<html>not a workbook", ISIN)
