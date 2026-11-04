"""Fetch the iShares fund data file and factsheet, discovering both links from the product page."""

from __future__ import annotations

import html
import re

from pipeline.fetch.base import FetchedFile, FetchError
from pipeline.net import PoliteClient

DATA_LINK = re.compile(r'href="(https://www\.blackrock\.com/varnish-api/[^"]*get-fund-document[^"]*)"')
FACTSHEET_LINK = re.compile(r'href="(https://www\.ishares\.com/gls-download/literature/fact-sheet/[^"]+\.pdf)"')


def fetch_ishares(client: PoliteClient, isin: str, product_url: str) -> list[FetchedFile]:
    page = client.get(product_url).text
    pid = product_url.rstrip("/").rsplit("/", 1)[-1]
    # The page data pairs the ISIN with its product id: "ISIN~SEDOL~productId".
    if not re.search(re.escape(isin) + r"~[^~&\"]*~" + re.escape(pid) + r"\b", page):
        raise FetchError(f"product page {product_url} does not belong to {isin}")
    data_m, fs_m = DATA_LINK.search(page), FACTSHEET_LINK.search(page)
    if not data_m:
        raise FetchError("fund data download link not found on product page (page layout may have changed)")
    files = []
    data_url = html.unescape(data_m[1])
    files.append(FetchedFile("ishares_fund_data", data_url, "fund_data.xls", client.get(data_url).content))
    if fs_m:
        files.append(FetchedFile("ishares_factsheet", fs_m[1], "factsheet.pdf", client.get(fs_m[1]).content))
    else:
        files.append(FetchedFile("ishares_factsheet", "", "", b"", meta={"missing": "factsheet link not found"}))
    return files
