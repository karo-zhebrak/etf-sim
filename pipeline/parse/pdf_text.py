"""PDF text extraction shared by the factsheet parsers."""

from __future__ import annotations

import io

from pipeline.common import ParseError


def extract(data: bytes, split_heading: str | None = None) -> tuple[list[str], str, str]:
    """Return (text of each page, left-column text of page 1, right-column text of page 1).

    Bold text in HSBC factsheets is drawn twice, so characters are de-duplicated. If
    split_heading is given, page 1 is split at the x position of that heading, which
    separates two-column layouts.
    """
    import pdfplumber

    try:
        pdf = pdfplumber.open(io.BytesIO(data))
    except Exception as e:
        raise ParseError(f"not a readable PDF: {e}") from e
    with pdf:
        pages = [(p.dedupe_chars().extract_text() or "") for p in pdf.pages]
        left = right = ""
        if split_heading and pdf.pages:
            p = pdf.pages[0].dedupe_chars()
            first = split_heading.split()[0]
            words = p.extract_words()
            for i, w in enumerate(words):
                following = " ".join(x["text"] for x in words[i:i + len(split_heading.split())])
                if w["text"] == first and following == split_heading:
                    left = p.crop((0, 0, w["x0"] - 2, p.height)).extract_text() or ""
                    right = p.crop((w["x0"] - 2, 0, p.width, p.height)).extract_text() or ""
                    break
    if not any(pages):
        raise ParseError("PDF has no extractable text")
    return pages, left, right


def section(text: str, start: str, end: str) -> str | None:
    """Text between two headings (exclusive), whitespace-collapsed."""
    i = text.find(start)
    if i < 0:
        return None
    i += len(start)
    j = text.find(end, i)
    body = text[i:j if j >= 0 else None]
    return " ".join(body.split()) or None
