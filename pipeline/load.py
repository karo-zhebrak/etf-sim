"""Idempotent loads into Supabase Postgres (service role connection).

* Time series and reference rows: bulk upsert (COPY into a staging table, then
  INSERT ... ON CONFLICT DO UPDATE only where a value actually changed).
* Snapshots (exposures, holdings, performance): replaced per (isin, as_of) in one transaction.
* etfs: facts missing from this run's files keep their stored values (COALESCE), so a run
  that re-parses only one changed file never blanks other columns.
Running the same month twice therefore leaves the data unchanged.
"""

from __future__ import annotations

import json
from collections.abc import Iterable, Sequence

import psycopg
from psycopg import sql

from pipeline.config import EtfConfig
from pipeline.fetch.base import FetchedFile
from pipeline.labels import Mappings
from pipeline.models import FxRate, ParsedFile
from pipeline.validate import DataFlag

ETF_FACT_COLS = ["primary_ticker", "name", "share_class_currency", "base_currency", "domicile", "benchmark_index",
                 "benchmark_key", "distribution", "replication", "asset_class", "inception_date", "fund_launch_date",
                 "description", "factsheet_url", "isa_eligible", "uk_reporting"]


def connect(db_url: str) -> psycopg.Connection:
    return psycopg.connect(db_url, connect_timeout=30, application_name="etf-sim-pipeline")


def _json(v):
    return json.dumps(v) if isinstance(v, dict) else v


def upsert(cur: psycopg.Cursor, table: str, cols: Sequence[str], key: Sequence[str], rows: Iterable[Sequence]) -> int:
    """Bulk upsert; updates only rows whose non-key values differ. Returns rows staged."""
    rows = list(rows)
    if not rows:
        return 0
    stage = f"_stage_{table}"
    ident = sql.Identifier
    cur.execute(sql.SQL("drop table if exists {}").format(ident(stage)))
    cur.execute(sql.SQL("create temp table {} (like public.{} including defaults) on commit drop")
                .format(ident(stage), ident(table)))
    with cur.copy(sql.SQL("copy {} ({}) from stdin").format(ident(stage), sql.SQL(", ").join(map(ident, cols)))) as cp:
        for r in rows:
            cp.write_row([_json(v) for v in r])
    upd = [c for c in cols if c not in key]
    collist = sql.SQL(", ").join(map(ident, cols))
    if upd:
        action = sql.SQL("do update set {} where ({}) is distinct from ({})").format(
            sql.SQL(", ").join(sql.SQL("{0} = excluded.{0}").format(ident(c)) for c in upd),
            sql.SQL(", ").join(sql.SQL("{}.{}").format(ident(table), ident(c)) for c in upd),
            sql.SQL(", ").join(sql.SQL("excluded.{}").format(ident(c)) for c in upd))
    else:
        action = sql.SQL("do nothing")
    cur.execute(sql.SQL("insert into public.{t} ({c}) select distinct on ({k}) {c} from {s} on conflict ({k}) {a}").format(
        t=ident(table), c=collist, s=ident(stage), k=sql.SQL(", ").join(map(ident, key)), a=action))
    return len(rows)


class Loader:
    def __init__(self, conn: psycopg.Connection):
        self.conn = conn

    # --- runs and bookkeeping -------------------------------------------------

    def start_run(self, git_sha: str | None) -> int:
        with self.conn.transaction():
            return self.conn.execute("insert into pipeline_runs (git_sha) values (%s) returning id", (git_sha,)).fetchone()[0]

    def finish_run(self, run_id: int, status: str, summary: dict) -> None:
        with self.conn.transaction():
            self.conn.execute("update pipeline_runs set finished_at = now(), status = %s, summary = %s where id = %s",
                              (status, json.dumps(summary, default=str), run_id))

    def mappings(self) -> Mappings:
        rows = self.conn.execute("select kind, issuer, source_label, normalised_label, iso_code from label_mappings").fetchall()
        return {(k, i, s.lower()): (n, iso) for k, i, s, n, iso in rows}

    def known_file(self, isin: str | None, file_type: str, sha256: str) -> bool:
        """True if this exact file was already parsed and loaded successfully."""
        row = self.conn.execute(
            "select 1 from source_files where isin is not distinct from %s and file_type = %s and sha256 = %s "
            "and parse_status = 'ok'", (isin, file_type, sha256)).fetchone()
        self.conn.commit()
        return row is not None

    def record_files(self, run_id: int, isin: str | None, issuer: str, files: list[tuple[FetchedFile, str | None, str, str | None]]) -> None:
        """files: (file, storage_path, parse_status, error). Unchanged files only get run_id/fetched_at refreshed."""
        with self.conn.transaction():
            for f, path, status, error in files:
                if not f.content:
                    continue
                self.conn.execute(
                    """insert into source_files (run_id, isin, issuer, file_type, url, sha256, size_bytes, storage_path, parse_status, error)
                       values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                       on conflict (isin, file_type, sha256) do update set
                         run_id = excluded.run_id, fetched_at = now(),
                         storage_path = coalesce(excluded.storage_path, source_files.storage_path),
                         parse_status = case when excluded.parse_status = 'skipped_unchanged'
                                             then source_files.parse_status else excluded.parse_status end,
                         error = case when excluded.parse_status = 'skipped_unchanged'
                                      then source_files.error else excluded.error end""",
                    (run_id, isin, issuer, f.file_type, f.url, f.sha256, len(f.content), path, status, error))

    # --- data -----------------------------------------------------------------

    def load_etf(self, cfg: EtfConfig, p: ParsedFile, flags: list[DataFlag], run_id: int) -> dict[str, int]:
        n: dict[str, int] = {}
        with self.conn.transaction():
            cur = self.conn.cursor()
            f = p.facts
            vals = {c: getattr(f, c) if f else None for c in ETF_FACT_COLS}
            vals["name"] = vals["name"] or cfg.issuer_fund_name or cfg.name
            exists = cur.execute("select 1 from etfs where isin = %s", (cfg.isin,)).fetchone() is not None
            if exists:
                # Facts missing from this run's files (e.g. only the price file changed) keep their
                # stored values. An UPDATE is used because INSERT ... ON CONFLICT checks NOT NULL
                # on the proposed row before resolving the conflict.
                changed = [c for c in ETF_FACT_COLS if vals[c] is not None]
                cur.execute(
                    sql.SQL("update etfs set issuer = %s, product_url = %s{sets}, updated_at = now() "
                            "where isin = %s and (issuer, product_url{cols}) is distinct from (%s, %s{phs})").format(
                        sets=sql.SQL("").join(sql.SQL(", {} = %s").format(sql.Identifier(c)) for c in changed),
                        cols=sql.SQL("").join(sql.SQL(", {}").format(sql.Identifier(c)) for c in changed),
                        phs=sql.SQL("").join(sql.SQL(", %s") for _ in changed)),
                    [cfg.issuer, cfg.product_url] + [vals[c] for c in changed] + [cfg.isin, cfg.issuer, cfg.product_url]
                    + [vals[c] for c in changed])
            else:
                cols = ["isin", "issuer", "product_url"] + ETF_FACT_COLS
                cur.execute(sql.SQL("insert into etfs ({}) values ({})").format(
                    sql.SQL(", ").join(map(sql.Identifier, cols)), sql.SQL(", ").join(sql.Placeholder() * len(cols))),
                    [cfg.isin, cfg.issuer, cfg.product_url] + [vals[c] for c in ETF_FACT_COLS])
            n["etfs"] = 1

            n["listings"] = upsert(cur, "listings", ["isin", "exchange", "ticker", "trading_currency"],
                                   ["isin", "exchange", "ticker"],
                                   [(l.isin, l.exchange, l.ticker, l.trading_currency) for l in p.listings])

            snap_cols = ["isin", "as_of", "ter", "net_assets", "net_assets_currency", "shares_outstanding", "n_holdings",
                         "pe", "pb", "std_3y", "beta_3y", "yield_to_maturity", "effective_duration",
                         "weighted_avg_maturity", "ounces_in_trust", "extra"]
            n["fund_fact_snapshots"] = upsert(cur, "fund_fact_snapshots", snap_cols, ["isin", "as_of"],
                                              [[getattr(s, c) for c in snap_cols] for s in p.snapshots])

            n["performance_returns"] = self._replace(
                cur, "performance_returns", p.performance, ["source"],
                ["isin", "as_of", "period_type", "period_label", "fund_return", "benchmark_return", "currency", "source"])
            n["exposures"] = self._replace(
                cur, "exposures", p.exposures, [],
                ["isin", "as_of", "kind", "label", "label_normalised", "iso_code", "weight"])
            n["holdings"] = self._replace(
                cur, "holdings", p.holdings, [],
                ["isin", "as_of", "rank", "name", "issuer_ticker", "security_isin", "sector", "asset_class", "country",
                 "weight", "market_value", "currency", "is_partial"])

            n["nav_prices"] = upsert(cur, "nav_prices", ["isin", "date", "nav", "currency", "quality"], ["isin", "date"],
                                     [(x.isin, x.date, x.nav, x.currency, x.quality) for x in p.nav])
            n["total_return_index"] = upsert(cur, "total_return_index", ["isin", "series", "date", "value", "quality"],
                                             ["isin", "series", "date"],
                                             [(x.isin, x.series, x.date, x.value, x.quality) for x in p.total_return])

            # Flags describe the data just loaded: replace this ETF's flags for the tables reloaded.
            reloaded = [t for t, c in n.items() if c]
            cur.execute("delete from data_flags where isin = %s and table_name = any(%s)", (cfg.isin, reloaded))
            for fl in flags:
                cur.execute("insert into data_flags (run_id, isin, table_name, date, kind, detail) values (%s, %s, %s, %s, %s, %s)",
                            (run_id, cfg.isin, fl.table_name, fl.date, fl.kind, fl.detail))
        return n

    @staticmethod
    def _replace(cur, table: str, records, extra_keys: list[str], cols: list[str]) -> int:
        """Replace each (isin, as_of[, extra keys]) snapshot present in records."""
        if not records:
            return 0
        groups = {tuple(getattr(r, k) for k in ["isin", "as_of"] + extra_keys) for r in records}
        where = sql.SQL(" and ").join(sql.SQL("{} = %s").format(sql.Identifier(k)) for k in ["isin", "as_of"] + extra_keys)
        for g in groups:
            cur.execute(sql.SQL("delete from public.{} where {}").format(sql.Identifier(table), where), g)
        with cur.copy(sql.SQL("copy public.{} ({}) from stdin").format(
                sql.Identifier(table), sql.SQL(", ").join(map(sql.Identifier, cols)))) as cp:
            for r in records:
                cp.write_row([getattr(r, c) for c in cols])
        return len(records)

    def load_fx(self, rates: list[FxRate]) -> int:
        with self.conn.transaction():
            return upsert(self.conn.cursor(), "fx_rates", ["date", "base", "quote", "rate", "source"], ["date", "base", "quote"],
                          [(r.date, r.base, r.quote, r.rate, r.source) for r in rates])
