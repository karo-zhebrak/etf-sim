"""Supabase Storage for raw issuer files: gzipped, private bucket, last 3 monthly runs kept.

Layout: raw-issuer-files/{yyyy-mm}/{issuer}/{isin}/{file}.gz
"""

from __future__ import annotations

import gzip
import re

import httpx

BUCKET = "raw-issuer-files"
KEEP_MONTHS = 3


class Storage:
    def __init__(self, url: str, service_key: str):
        self.base = url.rstrip("/") + "/storage/v1"
        self.client = httpx.Client(timeout=120, headers={"Authorization": f"Bearer {service_key}", "apikey": service_key})

    @staticmethod
    def path(month: str, issuer: str, isin: str | None, filename: str) -> str:
        return "/".join(p for p in (month, issuer, isin, filename) if p) + ".gz"

    def upload(self, path: str, data: bytes) -> None:
        r = self.client.post(f"{self.base}/object/{BUCKET}/{path}", content=gzip.compress(data),
                             headers={"Content-Type": "application/gzip", "x-upsert": "true"})
        r.raise_for_status()

    def download(self, path: str) -> bytes | None:
        r = self.client.get(f"{self.base}/object/{BUCKET}/{path}")
        if r.status_code in (400, 404):
            return None
        r.raise_for_status()
        return gzip.decompress(r.content)

    def list(self, prefix: str) -> list[dict]:
        out, offset = [], 0
        while True:
            r = self.client.post(f"{self.base}/object/list/{BUCKET}",
                                 json={"prefix": prefix, "limit": 1000, "offset": offset})
            r.raise_for_status()
            page = r.json()
            out.extend(page)
            if len(page) < 1000:
                return out
            offset += 1000

    def _files_under(self, prefix: str) -> list[str]:
        files = []
        for entry in self.list(prefix):
            full = f"{prefix}/{entry['name']}" if prefix else entry["name"]
            if entry.get("id") is None:  # folder
                files.extend(self._files_under(full))
            else:
                files.append(full)
        return files

    def months(self) -> list[str]:
        return sorted(e["name"] for e in self.list("") if re.fullmatch(r"\d{4}-\d{2}", e["name"]))

    def latest_month_with(self, issuer: str, isin: str | None) -> str | None:
        for m in reversed(self.months()):
            prefix = f"{m}/{issuer}/{isin}" if isin else f"{m}/{issuer}"
            if self.list(prefix):
                return m
        return None

    def prune(self, keep: int = KEEP_MONTHS) -> list[str]:
        """Delete month folders older than the newest `keep`. Returns the months deleted."""
        old = self.months()[:-keep]
        for m in old:
            files = self._files_under(m)
            for i in range(0, len(files), 500):
                r = self.client.request("DELETE", f"{self.base}/object/{BUCKET}", json={"prefixes": files[i:i + 500]})
                r.raise_for_status()
        return old

    def close(self) -> None:
        self.client.close()
