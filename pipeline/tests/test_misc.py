"""Validation, labels, FX, iShares factsheet text and HSBC page settings."""

import datetime as dt

import pytest

from pipeline.common import ParseError
from pipeline.fetch.hsbc import extract_page_information
from pipeline.fx import parse_ecb_csv
from pipeline.labels import normalise
from pipeline.models import EtfFacts, Exposure, NavPrice, ParsedFile, TotalReturnPoint
from pipeline.parse.ishares_data import parse_ishares_fund_data
from pipeline.parse.ishares_factsheet import parse_ishares_factsheet_text
from pipeline.validate import validate

from .conftest import ISIN, ishares_sheets, spreadsheetml

D = dt.date


def _nav(*values):
    return [NavPrice(isin=ISIN, date=D(2026, 1, i + 1), nav=v, currency="USD") for i, v in enumerate(values)]


def test_validation_passes_clean_file(ishares_file):
    p = parse_ishares_fund_data(ishares_file, ISIN)
    v = validate(p, ISIN)
    assert v.errors == []
    # the synthetic benchmark glitch (10,000 -> 14,600 on day 2) is flagged, not dropped
    assert any("benchmark" in f.detail for f in v.flags)
    flagged = [t for t in p.total_return if t.quality == "flagged"]
    assert [(t.series, t.date) for t in flagged] == [("benchmark", D(2009, 9, 28))]


def test_distributing_class_is_rejected():
    p = parse_ishares_fund_data(spreadsheetml(ishares_sheets(use_of_income="Distributing")), ISIN)
    assert any("distributing" in e for e in validate(p, ISIN).errors)


def test_duplicates_and_jumps():
    p = ParsedFile(isin=ISIN, facts=EtfFacts(isin=ISIN, distribution="acc", share_class_currency="USD"),
                   nav=_nav(10, 10.1, 15) + _nav(10))
    v = validate(p, ISIN)
    assert v.errors == [] and "NAV: dropped 1 duplicate rows" in v.warnings
    assert [n.quality for n in p.nav] == ["ok", "ok", "flagged"]

    p.nav = _nav(10) + [NavPrice(isin=ISIN, date=D(2026, 1, 1), nav=11, currency="USD")]
    assert any("conflicting" in e for e in validate(p, ISIN).errors)


def test_weights_sum_flag():
    exp = [Exposure(isin=ISIN, as_of=D(2026, 1, 1), kind="sector", label="Energy", weight=90)]
    p = ParsedFile(isin=ISIN, facts=EtfFacts(isin=ISIN, distribution="acc"), nav=_nav(1), exposures=exp)
    v = validate(p, ISIN)
    assert any(f.kind == "weights_sum" for f in v.flags)


def test_label_normalisation_scopes(mappings):
    exp = lambda label, kind="sector": Exposure(isin=ISIN, as_of=D(2026, 1, 1), kind=kind, label=label, weight=1)  # noqa: E731
    equity = [exp("Communication"), exp("Technology"), exp("Mainland China", "country"), exp("Made Up")]
    warnings = normalise(equity, "hsbc", "equity", mappings)
    assert [e.label_normalised for e in equity] == ["Communication Services", "Information Technology", "China", None]
    assert equity[2].iso_code == "CN"
    assert warnings == ["unmapped sector label 'Made Up'"]
    bond = [exp("Technology"), exp("FINANCIAL INSTITUTIONS")]
    normalise(bond, "hsbc", "fixed_income", mappings)
    assert [e.label_normalised for e in bond] == ["Corporate", "Corporate"]


def test_ecb_csv():
    rates = parse_ecb_csv("Date,USD,JPY,GBP,\n2026-10-30,1.1000,N/A,0.8500,\n")
    assert {(r.quote, r.rate) for r in rates} == {("USD", 1.1), ("GBP", 0.85)}
    assert all(r.base == "EUR" and r.date == D(2026, 10, 30) for r in rates)
    with pytest.raises(ParseError):
        parse_ecb_csv("Date,USD\n2026-10-30,1.1\n")


def test_ishares_factsheet_text():
    left = ("FUND OVERVIEW\nThe Fund seeks to track an index of\ndeveloped market companies.\n"
            "KEY BENEFITS\n1. Broad exposure\n2. Low cost\nRISK INDICATOR")
    p = parse_ishares_factsheet_text([f"PRODUCT INFORMATION\nISIN : {ISIN}"], left, ISIN)
    assert p.facts.description == ("The Fund seeks to track an index of developed market companies.\n\n"
                                   "Key benefits:\n- Broad exposure\n- Low cost")


def test_hsbc_page_information():
    page = """<script>window.HSBC.dpas = { other: 1, pageInformation: {
        language: 'en', country: 'gb', // comment
        investorType: 'individual-investor', shareId: 'IE00TEST0007',
        presentationUrl: { id: 'abc', url: '/x' },
    }, more: 2 };</script>"""
    pi = extract_page_information(page)
    assert pi["shareId"] == "IE00TEST0007" and pi["presentationUrl"]["id"] == "abc"
