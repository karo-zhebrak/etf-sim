"""Shared parsing helpers: issuer dates and numbers."""

from __future__ import annotations

import datetime as dt
import re

_MONTHS = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6, "june": 6,
    "jul": 7, "july": 7, "aug": 8, "sep": 9, "sept": 9, "oct": 10, "nov": 11, "dec": 12,
    "january": 1, "february": 2, "march": 3, "april": 4, "august": 8,
    "september": 9, "october": 10, "november": 11, "december": 12,
}


class ParseError(ValueError):
    """A file did not have the structure a parser expects."""


def parse_date(value: str | None) -> dt.date | None:
    """Parse the date formats issuers use.

    Handles "30/Oct/2026", "30/Sept/2026", "Fri, 30 Oct 2026", "30 September 2026",
    "30-Sept-2021", "11/2/2026 12:00:00 AM" (US month/day) and ISO "2026-10-30".
    Returns None for empty or placeholder values.
    """
    if value is None:
        return None
    if isinstance(value, dt.datetime):
        return value.date()
    if isinstance(value, dt.date):
        return value
    s = str(value).strip()
    if not s or s in {"-", "--", "N/A"}:
        return None
    s = re.sub(r"^[A-Za-z]{3},\s*", "", s)  # drop weekday prefix
    m = re.fullmatch(r"(\d{4})-(\d{2})-(\d{2})", s)
    if m:
        return dt.date(int(m[1]), int(m[2]), int(m[3]))
    m = re.fullmatch(r"(\d{1,2})[/\- ]([A-Za-z]{3,9})\.?[/\- ](\d{4})", s)
    if m:
        month = _MONTHS.get(m[2].lower())
        if month is None:
            raise ParseError(f"unknown month in date {value!r}")
        return dt.date(int(m[3]), month, int(m[1]))
    m = re.fullmatch(r"(\d{1,2})/(\d{1,2})/(\d{4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?\s*[AP]M)?", s)
    if m:  # HSBC exports use US month/day order
        return dt.date(int(m[3]), int(m[1]), int(m[2]))
    m = re.fullmatch(r"(\d{2})/(\d{2})/(\d{2})", s)
    if m:  # HSBC factsheet rolling periods: dd/mm/yy
        return dt.date(2000 + int(m[3]), int(m[2]), int(m[1]))
    raise ParseError(f"unrecognised date {value!r}")


def parse_number(value) -> float | None:
    """Parse "USD 8,472,383,230.74", "0.20%", "1,250", "25.62x", "-". Returns None if empty."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    s = str(value).strip()
    if not s or s in {"-", "--", "N/A", "n/a"}:
        return None
    s = re.sub(r"^[A-Z]{3}\s+", "", s)  # currency prefix
    s = s.replace(",", "").rstrip("%x").strip()
    try:
        return float(s)
    except ValueError as e:
        raise ParseError(f"unrecognised number {value!r}") from e


def split_money(value: str | None) -> tuple[str | None, float | None]:
    """Split "USD 146,109,171,304" into ("USD", 146109171304.0)."""
    if value is None:
        return None, None
    s = str(value).strip()
    m = re.match(r"^([A-Z]{3})\s+(.*)$", s)
    if m:
        return m[1], parse_number(m[2])
    return None, parse_number(s)


def yes_no(value: str | None) -> bool | None:
    if value is None:
        return None
    s = str(value).strip().lower()
    if s in {"yes", "y", "true"}:
        return True
    if s in {"no", "n", "false"}:
        return False
    return None
