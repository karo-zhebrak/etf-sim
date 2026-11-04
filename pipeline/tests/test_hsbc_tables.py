import datetime as dt

import pytest

from pipeline.common import ParseError
from pipeline.parse.hsbc_tables import parse_hsbc_holdings_rows, parse_hsbc_price_history, parse_hsbc_price_rows

from .conftest import ISIN, xlsx_bytes

PRICE_ROWS = [
    ["NAV history report"], ["HSBC TEST UCITS ETF"], ["Share Class : USD (Acc)"], [ISIN], [],
    ["Date", "Currency", "NAV", "Shares", "AUM"],
    ["11/2/2026 12:00:00 AM", "USD", "12.3456", "-", "-"],
    ["10/30/2026 12:00:00 AM", "USD", "12.5000", "1000", "12500"],
    ["7/31/2022 12:00:00 AM", "USD", "-", "-", "-"],          # before launch
]


def test_price_history_from_xlsx():
    p = parse_hsbc_price_history(xlsx_bytes(PRICE_ROWS), ISIN)
    assert [(n.date, n.nav, n.currency) for n in p.nav] == [
        (dt.date(2026, 11, 2), 12.3456, "USD"), (dt.date(2026, 10, 30), 12.5, "USD")]
    assert p.warnings == []


def test_price_history_isin_mismatch():
    with pytest.raises(ParseError, match="ISIN mismatch"):
        parse_hsbc_price_rows(PRICE_ROWS, "IE00BXXXXXX0")


def test_price_history_changed_columns():
    rows = [r[:] for r in PRICE_ROWS]
    rows[5] = ["Date", "Ccy", "Price"]
    with pytest.raises(ParseError, match="columns changed"):
        parse_hsbc_price_rows(rows, ISIN)


HOLDINGS_ROWS = [
    ["", "", ""], ["Name", "HSBC Test UCITS ETF"], ["Date", "2026-10-23"], ["Fund Size", "1000"], [""], [""],
    ["ISIN", "CUSIP", "SecurityName", "NumberOfShare", "MarketValue", "Country", "LocalCurrencyCode", "Weighting"],
    ["US0000000001", "000000001", "Alpha Inc", "10", "600", "United States", "USD", "60.0"],
    ["JP0000000002", "", "Beta KK", "5", "400", "Japan", "JPY", "40.0"],
    ["", "", "Usd Distribution Payable", "0", "0", "", "USD", "0"],   # zero-weight accrual line
]


def test_holdings_rows():
    p = parse_hsbc_holdings_rows(HOLDINGS_ROWS, ISIN)
    assert [(h.rank, h.name, h.security_isin, h.country, h.weight) for h in p.holdings] == [
        (1, "Alpha Inc", "US0000000001", "United States", 60.0), (2, "Beta KK", "JP0000000002", "Japan", 40.0)]
    assert all(h.as_of == dt.date(2026, 10, 23) and not h.is_partial for h in p.holdings)


def test_holdings_missing_header():
    with pytest.raises(ParseError):
        parse_hsbc_holdings_rows(HOLDINGS_ROWS[:6], ISIN)
