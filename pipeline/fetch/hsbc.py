"""Fetch HSBC price history, factsheet and full holdings from the individual-investor fund page.

The price history download sits behind the page's own API: read the page's settings
(window.HSBC.dpas pageInformation), get a short-lived token per component, ask for the
page presentation, find the "Prices and fees" list section, and POST to the fund-history
link it returns. Plain HTTP only; no terms screen is clicked through.
"""

from __future__ import annotations

import json
import re

from pipeline.fetch.base import FetchedFile, FetchError
from pipeline.net import PoliteClient

BASE = "https://www.assetmanagement.hsbc.co.uk"
_IFC_KEYS = ["language", "country", "investorType", "shareId", "id", "exchange", "currency", "performance"]


def _get(o, path, default=None):
    for k in path.split("."):
        try:
            o = o[int(k)] if isinstance(o, list) else o[k]
        except (KeyError, IndexError, TypeError, ValueError):
            return default
    return o


def extract_page_information(page: str) -> dict:
    """Pull the pageInformation object literal out of the page script and parse it."""
    i = page.find("window.HSBC.dpas")
    if i < 0:
        raise FetchError("fund page has no window.HSBC.dpas settings (page layout may have changed)")
    i = page.find("pageInformation:", i)
    i = page.find("{", i)
    depth = 0
    for j in range(i, len(page)):
        depth += (page[j] == "{") - (page[j] == "}")
        if depth == 0:
            js = page[i:j + 1]
            break
    else:
        raise FetchError("could not find the end of pageInformation")
    js = re.sub(r"//[^\n]*", "", js).replace("'", '"')
    js = re.sub(r'([{,]\s*)([A-Za-z_]\w*)\s*:', r'\1"\2":', js)
    js = re.sub(r",(\s*[}\]])", r"\1", js)
    try:
        return json.loads(js)
    except json.JSONDecodeError as e:
        raise FetchError(f"could not parse pageInformation: {e}") from e


class _Api:
    def __init__(self, client: PoliteClient, page_info: dict):
        self.client, self.pi = client, page_info

    def _token(self, component: str) -> str:
        r = self.client.post(BASE + "/api/v1/token/issue",
                             headers={"X-Country": "GB", "X-Language": "EN", "X-Component": component})
        return r.text.strip().strip('"')

    def post(self, url: str, component: str, body: dict):
        body = {**body, "pageInformation": self.pi}
        vals = []
        for k in _IFC_KEYS:
            v = self.pi.get(k) if k in ("language", "country", "investorType", "shareId") else body.get(k)
            if v:
                vals.append(str(v))
        return self.client.post(
            url if url.startswith("http") else BASE + url, json=body,
            headers={"Authorization": "Bearer " + self._token(component),
                     "IFC-Cache-Header": ",".join(vals).lower()})


def fetch_hsbc(client: PoliteClient, isin: str, product_url: str) -> list[FetchedFile]:
    page = client.get(product_url).text
    pi = extract_page_information(page)
    if str(pi.get("shareId", "")).upper() != isin:
        raise FetchError(f"fund page {product_url} is for {pi.get('shareId')}, not {isin}")
    api = _Api(client, pi)
    pid = pi["presentationUrl"]["id"]
    pres = api.post("/api/v1/detail/presentation", pid, {"id": pid}).json()
    sel = {
        "exchange": _get(pres, "exchange.items.0.id") or "nonetf",
        "currency": _get(pres, "exchange.items.0.selected") or _get(pres, "exchange.items.0.currency.0.options.0.id"),
        "performance": _get(pres, "performance.selected") or _get(pres, "performance.items.0.id"),
    }
    listings = [
        {"exchange": e.get("id"), "currencies": [o.get("label") for c in e.get("currency", []) for o in c.get("options", [])]}
        for e in (_get(pres, "exchange.items", []) or [])
    ]
    tabs = {t.get("title"): t for t in pres.get("tabs", [])}
    if "Prices and fees" not in tabs:
        raise FetchError(f"no 'Prices and fees' tab (tabs: {list(tabs)})")

    files: list[FetchedFile] = []
    history = None
    for s in tabs["Prices and fees"].get("sections", []):
        if s.get("type") != "List":
            continue
        items = api.post(s["requestUrl"]["url"], s["requestUrl"]["id"], {**s.get("payload", {}), **sel}).json().get("items") or []
        for it in items:
            link = it.get("link") or ""
            if "fund-history" in link:
                gid = link.split("id=", 1)[1]
                r = api.post(link.split("?")[0], it["componentId"], {"id": gid, **sel})
                history = FetchedFile("hsbc_price_history", BASE + link, "price_history.xlsx", r.content,
                                      meta={"listings": listings})
                break
        if history:
            break
    if history is None:
        raise FetchError("price history download not found in 'Prices and fees'")
    files.append(history)

    for doc, ftype, fname in (("factsheet", "hsbc_factsheet", "factsheet.pdf"),
                              ("holdings", "hsbc_holdings", "holdings.xls")):
        path = f"/api/v1/download/document/{isin.lower()}/gb/en/{doc}"
        if path in page:
            files.append(FetchedFile(ftype, BASE + path, fname, client.get(BASE + path).content))
        else:
            files.append(FetchedFile(ftype, "", "", b"", meta={"missing": f"no {doc} link on fund page"}))
    return files
