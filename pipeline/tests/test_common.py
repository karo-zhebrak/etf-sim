import datetime as dt

import pytest

from pipeline.common import ParseError, parse_date, parse_number, split_money


@pytest.mark.parametrize("raw,expected", [
    ("30/Oct/2026", dt.date(2026, 10, 30)),
    ("30/Sept/2026", dt.date(2026, 9, 30)),
    ("Fri, 30 Oct 2026", dt.date(2026, 10, 30)),
    ("Mon, 28 Sept 2009", dt.date(2009, 9, 28)),
    ("30 September 2026", dt.date(2026, 9, 30)),
    ("30-Sept-2021", dt.date(2021, 9, 30)),
    ("11/2/2026 12:00:00 AM", dt.date(2026, 11, 2)),   # HSBC: US month/day
    ("30/09/25", dt.date(2025, 9, 30)),                # HSBC factsheet: dd/mm/yy
    ("2026-10-23", dt.date(2026, 10, 23)),
    ("-", None), ("", None), (None, None),
])
def test_parse_date(raw, expected):
    assert parse_date(raw) == expected


def test_parse_date_rejects_garbage():
    with pytest.raises(ParseError):
        parse_date("not a date")


@pytest.mark.parametrize("raw,expected", [
    ("USD 8,472,383,230.74", 8472383230.74), ("0.20%", 0.20), ("1,250", 1250.0),
    ("25.62x", 25.62), ("-19.54", -19.54), ("-", None), ("", None), (3, 3.0),
])
def test_parse_number(raw, expected):
    assert parse_number(raw) == expected


def test_split_money():
    assert split_money("USD 146,109,171,304") == ("USD", 146109171304.0)
    assert split_money("1,000") == (None, 1000.0)
