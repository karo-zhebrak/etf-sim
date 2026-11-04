"""Typed records produced by parsers. Field names match the database columns."""

from __future__ import annotations

import datetime as dt
from typing import Literal

from pydantic import BaseModel, Field


class EtfFacts(BaseModel):
    """Static identity and facts (table: etfs). Fields are None when a file doesn't carry them."""

    isin: str
    name: str | None = None
    primary_ticker: str | None = None
    share_class_currency: str | None = None
    base_currency: str | None = None
    domicile: str | None = None
    benchmark_index: str | None = None
    benchmark_key: str | None = None
    distribution: Literal["acc", "none", "dist"] | None = None
    replication: Literal["physical", "physical_sampled", "synthetic"] | None = None
    asset_class: Literal["equity", "fixed_income", "commodity", "property", "multi_asset"] | None = None
    inception_date: dt.date | None = None
    fund_launch_date: dt.date | None = None
    description: str | None = None
    factsheet_url: str | None = None
    isa_eligible: bool | None = None
    uk_reporting: bool | None = None


class Listing(BaseModel):
    isin: str
    exchange: str
    ticker: str
    trading_currency: str | None = None


class FactSnapshot(BaseModel):
    isin: str
    as_of: dt.date
    ter: float | None = None
    net_assets: float | None = None
    net_assets_currency: str | None = None
    shares_outstanding: float | None = None
    n_holdings: int | None = None
    pe: float | None = None
    pb: float | None = None
    std_3y: float | None = None
    beta_3y: float | None = None
    yield_to_maturity: float | None = None
    effective_duration: float | None = None
    weighted_avg_maturity: float | None = None
    ounces_in_trust: float | None = None
    extra: dict = Field(default_factory=dict)


class PerformanceReturn(BaseModel):
    isin: str
    as_of: dt.date
    period_type: Literal["discrete", "annualised", "cumulative", "calendar"]
    period_label: str
    fund_return: float | None
    benchmark_return: float | None
    currency: str | None = None
    source: Literal["data_file", "factsheet"]


class Exposure(BaseModel):
    isin: str
    as_of: dt.date
    kind: Literal["sector", "country", "region", "asset_class", "maturity", "credit_quality"]
    label: str
    label_normalised: str | None = None
    iso_code: str | None = None
    weight: float


class Holding(BaseModel):
    isin: str
    as_of: dt.date
    rank: int
    name: str
    issuer_ticker: str | None = None
    security_isin: str | None = None
    sector: str | None = None
    asset_class: str | None = None
    country: str | None = None
    weight: float | None = None
    market_value: float | None = None
    currency: str | None = None
    is_partial: bool


class NavPrice(BaseModel):
    isin: str
    date: dt.date
    nav: float
    currency: str
    quality: Literal["ok", "flagged"] = "ok"


class TotalReturnPoint(BaseModel):
    isin: str
    series: Literal["fund", "benchmark"]
    date: dt.date
    value: float
    quality: Literal["ok", "flagged"] = "ok"


class FxRate(BaseModel):
    date: dt.date
    base: str
    quote: str
    rate: float
    source: str = "ECB euro reference rates"


class ParsedFile(BaseModel):
    """Everything one or more files yielded for one ETF. Lists are empty when not present."""

    isin: str
    facts: EtfFacts | None = None
    listings: list[Listing] = Field(default_factory=list)
    snapshots: list[FactSnapshot] = Field(default_factory=list)
    performance: list[PerformanceReturn] = Field(default_factory=list)
    exposures: list[Exposure] = Field(default_factory=list)
    holdings: list[Holding] = Field(default_factory=list)
    nav: list[NavPrice] = Field(default_factory=list)
    total_return: list[TotalReturnPoint] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
