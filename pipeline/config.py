from __future__ import annotations

from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel

PIPELINE_DIR = Path(__file__).resolve().parent
UNIVERSE = PIPELINE_DIR / "config" / "etf_universe.yaml"
RAW_DIR = PIPELINE_DIR / "raw"


class EtfConfig(BaseModel):
    issuer: Literal["ishares", "hsbc"]
    ticker: str          # label only; real tickers come from the files
    isin: str
    name: str
    issuer_fund_name: str | None = None
    product_url: str
    notes: str | None = None


def load_universe(path: Path = UNIVERSE) -> list[EtfConfig]:
    data = yaml.safe_load(path.read_text())
    etfs = [EtfConfig(**e) for e in data["etfs"]]
    isins = [e.isin for e in etfs]
    dupes = {i for i in isins if isins.count(i) > 1}
    if dupes:
        raise ValueError(f"duplicate ISINs in {path.name}: {sorted(dupes)}")
    return etfs
