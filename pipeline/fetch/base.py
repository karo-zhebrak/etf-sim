from __future__ import annotations

import hashlib
from dataclasses import dataclass, field


class FetchError(RuntimeError):
    """A page or file could not be fetched or its download link could not be found."""


@dataclass
class FetchedFile:
    file_type: str      # e.g. 'ishares_fund_data', 'hsbc_factsheet'
    url: str
    filename: str
    content: bytes
    meta: dict = field(default_factory=dict)

    @property
    def sha256(self) -> str:
        return hashlib.sha256(self.content).hexdigest()
