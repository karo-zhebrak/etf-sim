"""Parsers for HSBC spreadsheet downloads: price history (.xlsx) and full holdings (.xls).

Each parser is split into a reader (bytes -> rows) and a pure row parser, so tests can use
small synthetic row lists.
"""

from __future__ import annotations

import io
import re

from pipeline.common import ParseError, parse_date, parse_number
from pipeline.models import Holding, NavPrice, ParsedFile


def _cell(v):
    return "" if v is None else str(v).strip()


# ---------------------------------------------------------------------------
# Price history ("NAV history report")
# ---------------------------------------------------------------------------

def read_xlsx_rows(data: bytes) -> list[list[str]]:
    import openpyxl
    try:
        wb = openpyxl.load_workbook(io.BytesIO(data), read_only=True, data_only=True)
    except Exception as e:  # openpyxl raises several types for non-xlsx input
        raise ParseError(f"not an xlsx workbook: {e}") from e
    return [[_cell(v) for v in row] for row in wb.worksheets[0].iter_rows(values_only=True)]


def parse_hsbc_price_rows(rows: list[list[str]], isin: str) -> ParsedFile:
    warnings: list[str] = []
    header_idx = next((i for i, r in enumerate(rows) if r and r[0].lower() == "date"), None)
    if header_idx is None:
        raise ParseError("price history has no 'Date' header row")
    preamble = [c for r in rows[:header_idx] for c in r if c]
    file_isins = [c for c in preamble if re.fullmatch(r"[A-Z]{2}[A-Z0-9]{9}\d", c)]
    if not file_isins:
        raise ParseError("price history has no ISIN in its header")
    if file_isins[0] != isin:
        raise ParseError(f"ISIN mismatch: file has {file_isins[0]}, config has {isin}")
    header = [h.lower() for h in rows[header_idx]]
    try:
        i_date, i_ccy, i_nav = header.index("date"), header.index("currency"), header.index("nav")
    except ValueError as e:
        raise ParseError(f"price history columns changed: {rows[header_idx]}") from e
    nav: list[NavPrice] = []
    for r in rows[header_idx + 1:]:
        if len(r) <= max(i_date, i_ccy, i_nav) or not r[i_date]:
            continue
        v = parse_number(r[i_nav])
        if v is None:  # "-" placeholder rows before launch and on the latest, unfinalised day
            continue
        nav.append(NavPrice(isin=isin, date=parse_date(r[i_date]), nav=v, currency=r[i_ccy]))
    if not nav:
        raise ParseError("price history has no NAV rows")
    return ParsedFile(isin=isin, nav=nav, warnings=warnings)


def parse_hsbc_price_history(data: bytes, isin: str) -> ParsedFile:
    return parse_hsbc_price_rows(read_xlsx_rows(data), isin)


# ---------------------------------------------------------------------------
# Full holdings (legacy binary .xls)
# ---------------------------------------------------------------------------

def read_xls_rows(data: bytes) -> list[list[str]]:
    """Read the first sheet. A numeric cell right of a 'Date' label is converted to ISO date."""
    import xlrd
    try:
        book = xlrd.open_workbook(file_contents=data)
    except Exception as e:
        raise ParseError(f"not an xls workbook: {e}") from e
    sh = book.sheet_by_index(0)
    rows = []
    for i in range(sh.nrows):
        vals = sh.row_values(i)
        row = []
        for j, v in enumerate(vals):
            if j > 0 and _cell(vals[j - 1]).lower() == "date" and isinstance(v, float):
                v = xlrd.xldate_as_datetime(v, book.datemode).date().isoformat()
            elif isinstance(v, float) and v.is_integer() and abs(v) < 1e15:
                v = int(v)
            row.append(_cell(v))
        rows.append(row)
    return rows


def parse_hsbc_holdings_rows(rows: list[list[str]], isin: str) -> ParsedFile:
    meta = {r[0].lower(): r[1] for r in rows if len(r) > 1 and r[0] and r[1]}
    as_of = parse_date(meta.get("date"))
    if as_of is None:
        raise ParseError("holdings file has no Date")
    header_idx = next((i for i, r in enumerate(rows) if "SecurityName" in r), None)
    if header_idx is None:
        raise ParseError("holdings file has no SecurityName header")
    header = rows[header_idx]
    col = {h: i for i, h in enumerate(header)}
    for needed in ("SecurityName", "Weighting"):
        if needed not in col:
            raise ParseError(f"holdings file missing column {needed}")
    out: list[Holding] = []
    for r in rows[header_idx + 1:]:
        get = lambda h: r[col[h]] if h in col and col[h] < len(r) else ""  # noqa: E731
        name, w, sec_isin = get("SecurityName"), parse_number(get("Weighting")), get("ISIN")
        if not name or (not sec_isin and not w):  # zero-weight accrual / receivable lines
            continue
        out.append(Holding(
            isin=isin, as_of=as_of, rank=len(out) + 1, name=name,
            security_isin=sec_isin or None, country=get("Country") or None,
            weight=w, market_value=parse_number(get("MarketValue")),
            currency=get("LocalCurrencyCode") or None, is_partial=False,
        ))
    if not out:
        raise ParseError("holdings file has no holdings rows")
    return ParsedFile(isin=isin, holdings=out)


def parse_hsbc_holdings(data: bytes, isin: str) -> ParsedFile:
    return parse_hsbc_holdings_rows(read_xls_rows(data), isin)
