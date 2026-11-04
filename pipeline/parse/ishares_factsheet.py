"""iShares factsheet PDF: used only for the fund description (the data file lacks it)."""

from __future__ import annotations

import re

from pipeline.common import ParseError
from pipeline.models import EtfFacts, ParsedFile
from pipeline.parse.pdf_text import extract, section


def parse_ishares_factsheet_text(pages: list[str], left: str, isin: str) -> ParsedFile:
    full = "\n".join(pages)
    m = re.search(r"ISIN\s*:\s*([A-Z]{2}[A-Z0-9]{9}\d)", full)
    if not m:
        raise ParseError("factsheet has no ISIN")
    if m[1] != isin:
        raise ParseError(f"ISIN mismatch: factsheet has {m[1]}, config has {isin}")
    overview = section(left or pages[0], "FUND OVERVIEW", "KEY BENEFITS")
    benefits = section(left or pages[0], "KEY BENEFITS", "RISK INDICATOR")
    warnings = []
    if not overview:
        warnings.append("factsheet: no FUND OVERVIEW text found")
    desc = overview
    if overview and benefits:
        items = [b.strip() for b in re.split(r"\s*\d\.\s+", benefits) if b.strip()]
        desc = overview + "\n\nKey benefits:\n" + "\n".join(f"- {b}" for b in items)
    return ParsedFile(isin=isin, facts=EtfFacts(isin=isin, description=desc), warnings=warnings)


def parse_ishares_factsheet(data: bytes, isin: str) -> ParsedFile:
    pages, left, _ = extract(data, split_heading="PRODUCT INFORMATION")
    return parse_ishares_factsheet_text(pages, left, isin)
