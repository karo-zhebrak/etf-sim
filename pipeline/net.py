"""Polite HTTP client: >=3 s between requests to the same host, at most 3 retries with
exponential backoff, and a descriptive User-Agent with no personal contact details."""

from __future__ import annotations

import logging
import time

import httpx

USER_AGENT = "etf-sim-data-pipeline/0.1 (educational ETF simulator; +https://github.com/karo-zhebrak/etf-sim)"
MIN_INTERVAL = 3.0
MAX_RETRIES = 3

log = logging.getLogger(__name__)


class PoliteClient:
    def __init__(self, min_interval: float = MIN_INTERVAL, timeout: float = 60):
        self.min_interval = min_interval
        self._last: dict[str, float] = {}
        self.requests_made = 0
        self.client = httpx.Client(
            headers={"User-Agent": USER_AGENT, "Accept-Language": "en-GB"},
            follow_redirects=True, timeout=timeout,
        )

    def _wait(self, host: str) -> None:
        wait = self.min_interval - (time.monotonic() - self._last.get(host, -1e9))
        if wait > 0:
            time.sleep(wait)
        self._last[host] = time.monotonic()

    def request(self, method: str, url: str, **kw) -> httpx.Response:
        host = httpx.URL(url).host
        for attempt in range(MAX_RETRIES + 1):
            self._wait(host)
            self.requests_made += 1
            try:
                r = self.client.request(method, url, **kw)
                if r.status_code == 429 or r.status_code >= 500:
                    raise httpx.HTTPStatusError(f"HTTP {r.status_code}", request=r.request, response=r)
                r.raise_for_status()
                return r
            except (httpx.TransportError, httpx.HTTPStatusError) as e:
                retryable = not isinstance(e, httpx.HTTPStatusError) or e.response.status_code == 429 \
                    or e.response.status_code >= 500
                if attempt == MAX_RETRIES or not retryable:
                    raise
                backoff = 2 ** (attempt + 1)
                log.warning("%s %s failed (%s); retry %d in %ds", method, url, e, attempt + 1, backoff)
                time.sleep(backoff)
        raise AssertionError("unreachable")

    def get(self, url: str, **kw) -> httpx.Response:
        return self.request("GET", url, **kw)

    def post(self, url: str, **kw) -> httpx.Response:
        return self.request("POST", url, **kw)

    def close(self) -> None:
        self.client.close()
