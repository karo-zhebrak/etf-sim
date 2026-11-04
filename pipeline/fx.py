"""ECB euro foreign exchange reference rates (free; reuse allowed with attribution).

Source: European Central Bank, https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/
Rates are stored as published (1 EUR = rate quote). GBP crosses are derived in the fx_gbp view.
"""

from __future__ import annotations

import csv
import io
import zipfile

from pipeline.common import ParseError, parse_date
from pipeline.fetch.base import FetchedFile
from pipeline.models import FxRate
from pipeline.net import PoliteClient

ECB_HIST_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist.zip"
SOURCE = "ECB euro reference rates"
# Currencies needed for NAVs and for holdings/listing currencies we are likely to show.
CURRENCIES = ("GBP", "USD", "JPY", "CHF", "CAD", "AUD", "SEK", "NOK", "DKK", "HKD", "SGD",
              "CNY", "KRW", "INR", "BRL", "ZAR", "MXN", "NZD", "PLN")


def fetch_ecb(client: PoliteClient) -> FetchedFile:
    r = client.get(ECB_HIST_URL)
    return FetchedFile("ecb_fx", ECB_HIST_URL, "eurofxref-hist.zip", r.content)


def parse_ecb_csv(text: str, currencies=CURRENCIES) -> list[FxRate]:
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames or "Date" not in reader.fieldnames:
        raise ParseError("ECB file has no Date column")
    missing = [c for c in currencies if c not in reader.fieldnames]
    if "GBP" in missing:
        raise ParseError("ECB file has no GBP column")
    out = []
    for row in reader:
        d = parse_date(row["Date"])
        for c in currencies:
            v = (row.get(c) or "").strip()
            if v and v != "N/A":
                out.append(FxRate(date=d, base="EUR", quote=c, rate=float(v), source=SOURCE))
    if not out:
        raise ParseError("ECB file has no rates")
    return out


def parse_ecb_zip(data: bytes) -> list[FxRate]:
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            name = next(n for n in z.namelist() if n.lower().endswith(".csv"))
            return parse_ecb_csv(z.read(name).decode("utf-8"))
    except (zipfile.BadZipFile, StopIteration) as e:
        raise ParseError(f"ECB download is not the expected zip: {e}") from e
