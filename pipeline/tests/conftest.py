"""Synthetic fixtures that copy the structure of real issuer files. No real issuer data is used."""

from __future__ import annotations

import io
from xml.sax.saxutils import escape

import pytest

ISIN = "IE00TEST0007"  # not a real ISIN; matches the format (2 letters, 9 alphanumerics, 1 digit)


def spreadsheetml(sheets: dict[str, list[list]], raw_amp: bool = False) -> bytes:
    """Build a SpreadsheetML 2003 workbook. A cell may be (index, text) to emit ss:Index."""
    out = ['<?xml version="1.0"?>',
           '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" '
           'xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">']
    for name, rows in sheets.items():
        out.append(f'<Worksheet ss:Name="{escape(name)}"><Table>')
        for row in rows:
            out.append("<Row>")
            for cell in row:
                idx, text = cell if isinstance(cell, tuple) else (None, cell)
                attr = f' ss:Index="{idx}"' if idx else ""
                body = text if raw_amp else escape(text)
                out.append(f'<Cell{attr}><Data ss:Type="String">{body}</Data></Cell>')
            out.append("</Row>")
        out.append("</Table></Worksheet>")
    out.append("</Workbook>")
    return "\n".join(out).encode("utf-8")


def ishares_sheets(isin: str = ISIN, use_of_income: str = "Accumulating") -> dict[str, list[list]]:
    return {
        "Fund Header": [["iShares Test S&P World UCITS ETF"], [""], ["NAV as of 02/Nov/2026"], ["USD 10.50"]],
        "Performance Returns": [
            ["Discrete", (5, "as of"), "30/Sept/2026"], [],
            ["", "From 30-Sept-2024 To \n30-Sept-2025", "From 30-Sept-2025 To \n30-Sept-2026"],
            ["Total Return (%)", "10.00", "5.00"], ["Benchmark (%)", "9.90", "4.90"], [], [],
            ["Annualised"], [(5, "as of"), "30/Sept/2026"], [],
            ["", "1y", "3y", "Incept."], ["Total Return (%)", "5.00", "7.00", "6.00"],
            ["Benchmark (%)", "4.90", "6.90", "5.90"], [], [],
            ["Cumulative"], [(9, "as of"), "30/Sept/2026"], [],
            ["", "YTD", "1m"], ["Total Return (%)", "4.00", "-1.00"], ["Benchmark (%)", "3.90", "-1.10"], [],
            ["Calendar Year"], [], ["", "2024", "2025"],
            ["Total Return (%)", "8.0", "12.0"], ["Benchmark (%)", "7.9", "11.9"], [],
            ["The figures shown relate to past performance."],
        ],
        "Historical NAVs": [
            ["", (5, "Historical NAVs")],
            ["02/Nov/2026", "10.50", "", ""], ["30/Oct/2026", "10.40", "", ""], ["29/Oct/2026", "10.45", "", ""],
            [], ["The figures shown relate to past performance."],
        ],
        "Growth of Hypothetical 10,000": [
            ["", "iShares Test S&P World UCITS ETF", "Test Index (Net)"],
            ["Fri, 30 Oct 2026", "10,400.00", "10,500.00"],
            ["Thu, 29 Oct 2026", "10,450.00", "10,550.00"],
            ["Tue, 29 Sept 2009", "10,020.00", "10,030.00"],
            ["Mon, 28 Sept 2009", "10,010.00", "14,600.00"],   # glitch copied from real files
            ["Fri, 25 Sept 2009", "10,000.00", "10,000.00"],
        ],
        "Key Facts": [
            ["Net Assets of Share Class", "USD 1,234,567", "as of 02/Nov/2026"],
            ["Share Class Launch Date", "25/Sept/2009"], ["Fund Launch Date", "25/Sept/2009"],
            ["Share Class Currency", "USD"], ["Fund Base Currency", "USD"], ["Asset Class", "Equity"],
            ["Benchmark Index", "Test Index (Net)"], ["Shares Outstanding", "117,577", "as of 02/Nov/2026"],
            ["Total Expense Ratio", "0.20%"], ["ISIN", isin], ["Use of Income", use_of_income],
            ["Domicile", "Ireland"], ["Product Structure", "Physical"], ["Methodology", "Optimised"],
            ["Bloomberg Ticker", "TEST LN"], ["ISA Eligibility", "Yes"], ["UK Reporting Status", "Yes"],
        ],
        "Portfolio Characteristics": [
            ["Number of Holdings", "3", "as of 30/Oct/2026"], ["Benchmark Ticker", "TESTIDX"],
            ["Standard Deviation (3y)", "11.00%", "as of 30/Sept/2026"], ["3y Beta", "1.000", "as of 30/Sept/2026"],
            ["P/E Ratio", "20.00", "as of 30/Oct/2026"], ["P/B Ratio", "3.00", "as of 30/Oct/2026"],
        ],
        "Exposure Breakdowns": [
            ["Sector"], ["as of", "30/Oct/2026"], ["Type", "Fund", ""],
            ["Information Technology", "60.00"], ["Communication", "39.50"], ["Cash and/or Derivatives", "0.50"],
            [], [], ["Geography/Locations"], ["as of", "30/Oct/2026"], ["Type", "Fund", "", ""],
            ["United States", "70.00", "US"], ["Japan", "30.00", "JP"], [], [],
            ["Allocations are subject to change."],
        ],
        "Holdings": [
            ["All"], ["as of", "02/Nov/2026"],
            ["Issuer Ticker", "Name", "Sector", "Asset Class", "Market Value", "Weight (%)", "Notional Value",
             "Nominal", "Market Currency"],
            ["AAA", "ALPHA CORP", "Information Technology", "Equity", "USD 600.00", "60.00", "600.00", "6.00", "USD"],
            ["BBB", "BETA & SONS", "Communication", "Equity", "USD 395.00", "39.50", "395.00", "3.00", "USD"],
            ["USD", "USD CASH", "Cash and/or Derivatives", "Cash", "USD 5.00", "0.50", "5.00", "5.00", "USD"],
            ["Detailed Holdings and Analytics contains ..."],
        ],
        "Others": [[]],
    }


@pytest.fixture
def ishares_file() -> bytes:
    data = spreadsheetml(ishares_sheets())
    # Real files contain a bare "&" (e.g. "S&P"), which makes them invalid XML.
    return data.replace(b"S&amp;P World", b"S&P World")


def xlsx_bytes(rows: list[list]) -> bytes:
    import openpyxl
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "FundHistory"
    for r in rows:
        ws.append(r)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


@pytest.fixture
def mappings():
    from pipeline.labels import load_seed_mappings
    return load_seed_mappings()
