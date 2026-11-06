"""Orchestration: fetch -> store raw -> parse -> normalise -> validate -> load -> summary."""

from __future__ import annotations

import datetime as dt
import json
import logging
import os
import subprocess
import traceback
from dataclasses import dataclass, field
from pathlib import Path

from pipeline import labels
from pipeline.config import PIPELINE_DIR, RAW_DIR, EtfConfig, load_universe
from pipeline.fetch.base import FetchedFile
from pipeline.fetch.hsbc import fetch_hsbc
from pipeline.fetch.ishares import fetch_ishares
from pipeline.fx import fetch_ecb, parse_ecb_zip
from pipeline.models import EtfFacts, ParsedFile
from pipeline.net import PoliteClient
from pipeline.parse.hsbc_factsheet import parse_hsbc_factsheet
from pipeline.parse.hsbc_tables import parse_hsbc_holdings, parse_hsbc_price_history
from pipeline.parse.ishares_data import parse_ishares_fund_data
from pipeline.parse.ishares_factsheet import parse_ishares_factsheet
from pipeline.validate import validate

log = logging.getLogger("pipeline")

# file_type -> (filename, required). A missing optional file is a warning; a required one fails the ETF.
FILES = {
    "ishares": {"ishares_fund_data": ("fund_data.xls", True), "ishares_factsheet": ("factsheet.pdf", False)},
    "hsbc": {"hsbc_price_history": ("price_history.xlsx", True), "hsbc_factsheet": ("factsheet.pdf", True),
             "hsbc_holdings": ("holdings.xls", False)},
}
NAV_FILES = {"ishares_fund_data", "hsbc_price_history"}
FACT_FILES = {"ishares_fund_data", "hsbc_factsheet"}


@dataclass
class EtfResult:
    isin: str
    issuer: str
    ticker: str
    files: dict[str, str] = field(default_factory=dict)   # file_type -> ok | unchanged | missing | failed
    rows: dict[str, int] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    flags: list[str] = field(default_factory=list)
    unchanged: bool = False

    @property
    def ok(self) -> bool:
        return not self.errors

    @property
    def status(self) -> str:
        return "FAILED" if self.errors else ("UNCHANGED" if self.unchanged else "OK")


@dataclass
class Context:
    month: str
    skip_download: bool
    dry_run: bool
    mappings: labels.Mappings
    client: PoliteClient | None = None
    storage: object | None = None   # pipeline.storage.Storage
    loader: object | None = None    # pipeline.load.Loader
    run_id: int | None = None


def merge(into: ParsedFile, other: ParsedFile) -> ParsedFile:
    """Combine records from several files of one ETF. Facts: first non-empty value wins."""
    if other.facts:
        if into.facts is None:
            into.facts = other.facts
        else:
            for k, v in other.facts.model_dump().items():
                if getattr(into.facts, k) in (None, "") and v not in (None, ""):
                    setattr(into.facts, k, v)
    for attr in ("listings", "snapshots", "performance", "exposures", "holdings", "nav", "total_return", "warnings"):
        getattr(into, attr).extend(getattr(other, attr))
    return into


def raw_path(month: str, issuer: str, isin: str | None, filename: str) -> Path:
    return RAW_DIR.joinpath(*[p for p in (month, issuer, isin, filename) if p])


def latest_local_month(issuer: str, isin: str | None) -> str | None:
    sub = Path(issuer, isin) if isin else Path(issuer)
    months = sorted(p.name for p in RAW_DIR.glob("????-??") if (p / sub).is_dir())
    return months[-1] if months else None


def stored_file(ctx: Context, issuer: str, isin: str | None, fname: str) -> bytes | None:
    """Latest stored copy of a raw file: local pipeline/raw first, then Supabase Storage."""
    m = latest_local_month(issuer, isin)
    if m and raw_path(m, issuer, isin, fname).exists():
        return raw_path(m, issuer, isin, fname).read_bytes()
    if ctx.storage is not None:
        m = ctx.storage.latest_month_with(issuer, isin)
        if m:
            return ctx.storage.download(ctx.storage.path(m, issuer, isin, fname))
    return None


def save_raw(ctx: Context, issuer: str, isin: str | None, f: FetchedFile, warnings: list[str]) -> str | None:
    """Keep a local copy and, unless dry-run, a gzipped copy in Storage. Returns the storage path."""
    p = raw_path(ctx.month, issuer, isin, f.filename)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(f.content)
    if ctx.storage is None:
        return None
    path = ctx.storage.path(ctx.month, issuer, isin, f.filename)
    try:
        ctx.storage.upload(path, f.content)
        return path
    except Exception as e:
        warnings.append(f"storage upload failed for {f.filename}: {e}")
        return None


def get_files(etf: EtfConfig, ctx: Context) -> list[FetchedFile]:
    if ctx.skip_download:
        out = []
        for ftype, (fname, _) in FILES[etf.issuer].items():
            data = stored_file(ctx, etf.issuer, etf.isin, fname)
            out.append(FetchedFile(ftype, f"stored:{fname}", fname, data or b"",
                                   meta={} if data else {"missing": "no stored copy"}))
        if not any(f.content for f in out):
            raise FileNotFoundError("no stored raw files; run without --skip-download first")
        return out
    return (fetch_ishares if etf.issuer == "ishares" else fetch_hsbc)(ctx.client, etf.isin, etf.product_url)


def parse_file(f: FetchedFile, isin: str, mappings) -> ParsedFile:
    if f.file_type == "ishares_fund_data":
        return parse_ishares_fund_data(f.content, isin)
    if f.file_type == "ishares_factsheet":
        return parse_ishares_factsheet(f.content, isin)
    if f.file_type == "hsbc_price_history":
        return parse_hsbc_price_history(f.content, isin)
    if f.file_type == "hsbc_factsheet":
        return parse_hsbc_factsheet(f.content, isin, mappings)
    if f.file_type == "hsbc_holdings":
        return parse_hsbc_holdings(f.content, isin)
    raise ValueError(f"no parser for {f.file_type}")


def process_etf(etf: EtfConfig, ctx: Context) -> EtfResult:
    res = EtfResult(isin=etf.isin, issuer=etf.issuer, ticker=etf.ticker)
    try:
        files = get_files(etf, ctx)
    except Exception as e:  # one ETF failing must not stop the others
        res.errors.append(f"fetch: {e}")
        log.debug(traceback.format_exc())
        return res
    if ctx.loader is not None:
        ctx.loader.ensure_connected()  # downloads can take minutes; the server may have dropped us

    records: list[tuple[FetchedFile, str | None, str, str | None]] = []  # for source_files
    combined = ParsedFile(isin=etf.isin, facts=EtfFacts(isin=etf.isin))
    full_holdings, factsheet_top10, parsed_any = False, [], False
    for f in files:
        required = FILES[etf.issuer][f.file_type][1]
        if not f.content:
            res.files[f.file_type] = "missing"
            (res.errors if required else res.warnings).append(f"{f.file_type}: {f.meta.get('missing', 'missing')}")
            continue
        storage_path = None if ctx.skip_download else save_raw(ctx, etf.issuer, etf.isin, f, res.warnings)
        # Skip files already loaded unchanged (a forced re-parse via --skip-download ignores this).
        if ctx.loader is not None and not ctx.skip_download and ctx.loader.known_file(etf.isin, f.file_type, f.sha256):
            res.files[f.file_type] = "unchanged"
            records.append((f, storage_path, "skipped_unchanged", None))
            continue
        try:
            parsed = parse_file(f, etf.isin, ctx.mappings)
        except Exception as e:
            res.files[f.file_type] = "failed"
            (res.errors if required else res.warnings).append(f"{f.file_type}: {e}")
            records.append((f, storage_path, "failed", str(e)[:1000]))
            log.debug(traceback.format_exc())
            continue
        res.files[f.file_type] = "ok"
        records.append((f, storage_path, "ok", None))
        parsed_any = True
        if f.file_type in ("ishares_factsheet", "hsbc_factsheet") and f.url.startswith("http"):
            combined.facts.factsheet_url = f.url
        if f.file_type == "hsbc_factsheet":
            factsheet_top10, parsed.holdings = parsed.holdings, []
        if f.file_type == "hsbc_holdings":
            full_holdings = True
        merge(combined, parsed)
    if factsheet_top10 and not full_holdings and res.files.get("hsbc_holdings") != "unchanged":
        combined.holdings = factsheet_top10
        res.warnings.append("holdings: full file unavailable; using factsheet top 10 (is_partial)")

    if not parsed_any and not res.errors:
        res.unchanged = True
    else:
        asset_class = combined.facts.asset_class
        res.warnings.extend(combined.warnings)
        res.warnings.extend(labels.normalise(combined.exposures, etf.issuer, asset_class, ctx.mappings))
        v = validate(combined, etf.isin, expect_nav=any(res.files.get(t) == "ok" for t in NAV_FILES),
                     expect_facts=any(res.files.get(t) == "ok" for t in FACT_FILES))
        res.errors.extend(v.errors)
        res.warnings.extend(v.warnings)
        res.flags.extend(f"{fl.table_name}: {fl.detail}" for fl in v.flags)
        res.rows = {
            "etfs": 1, "listings": len(combined.listings), "fund_fact_snapshots": len(combined.snapshots),
            "performance_returns": len(combined.performance), "exposures": len(combined.exposures),
            "holdings": len(combined.holdings), "nav_prices": len(combined.nav),
            "total_return_index": len(combined.total_return),
        }
        if ctx.loader is not None and res.ok:
            try:
                res.rows = ctx.loader.load_etf(etf, combined, v.flags, ctx.run_id)
            except Exception as e:
                res.errors.append(f"load: {e}")
                records = [(f, p, "failed" if s == "ok" else s, f"load: {e}"[:1000] if s == "ok" else err)
                           for f, p, s, err in records]
                log.debug(traceback.format_exc())
        elif ctx.loader is not None:  # validation failed: nothing loaded, so don't mark files as loaded
            records = [(f, p, "failed" if s == "ok" else s, "validation failed" if s == "ok" else err)
                       for f, p, s, err in records]
    if ctx.loader is not None:
        try:
            ctx.loader.record_files(ctx.run_id, etf.isin, etf.issuer, records)
        except Exception as e:
            res.errors.append(f"recording source files: {e}")
    return res


def process_fx(ctx: Context) -> tuple[int | None, str | None, str]:
    """Returns (rows, error, status)."""
    try:
        if ctx.skip_download:
            data = stored_file(ctx, "ecb", None, "eurofxref-hist.zip")
            if not data:
                return None, "no stored ECB file", "FAILED"
            f = FetchedFile("ecb_fx", "stored:eurofxref-hist.zip", "eurofxref-hist.zip", data)
            path = None
        else:
            f = fetch_ecb(ctx.client)
            warnings: list[str] = []
            path = save_raw(ctx, "ecb", None, f, warnings)
        if ctx.loader is not None and not ctx.skip_download and ctx.loader.known_file(None, "ecb_fx", f.sha256):
            ctx.loader.record_files(ctx.run_id, None, "ecb", [(f, path, "skipped_unchanged", None)])
            return 0, None, "UNCHANGED"
        rates = parse_ecb_zip(f.content)
        if ctx.loader is not None:
            n = ctx.loader.load_fx(rates)
            ctx.loader.record_files(ctx.run_id, None, "ecb", [(f, path, "ok", None)])
            return n, None, "OK"
        return len(rates), None, "OK"
    except Exception as e:
        log.debug(traceback.format_exc())
        return None, str(e), "FAILED"


def print_summary(results: list[EtfResult], fx: tuple, dry_run: bool) -> None:
    cols = ["nav_prices", "total_return_index", "performance_returns", "exposures", "holdings", "fund_fact_snapshots", "listings"]
    short = ["nav", "tr_idx", "perf", "expo", "hold", "facts", "list"]
    head = f"{'ETF':<6} {'ISIN':<13} {'files':<6} " + " ".join(f"{s:>6}" for s in short) + f" {'warn':>5} {'flags':>5} {'err':>4}  status"
    print(f"\n{'Parsed rows (dry run, nothing written)' if dry_run else 'Rows loaded'}\n" + head + "\n" + "-" * len(head))
    for r in results:
        fetched = sum(1 for s in r.files.values() if s in ("ok", "unchanged"))
        print(f"{r.ticker:<6} {r.isin:<13} {fetched}/{len(FILES[r.issuer]):<4} "
              + " ".join(f"{r.rows.get(c, 0):>6}" for c in cols)
              + f" {len(r.warnings):>5} {len(r.flags):>5} {len(r.errors):>4}  {r.status}")
    print("-" * len(head))
    rows, err, status = fx
    print(f"FX (ECB): {status}" + (f", {rows} rates" if rows else "") + (f" - {err}" if err else ""))
    for r in results:
        if r.errors or r.warnings or r.flags:
            print(f"\n{r.ticker} {r.isin}")
            for e in r.errors:
                print(f"  ERROR   {e}")
            for w in r.warnings:
                print(f"  warning {w}")
            for fl in r.flags:
                print(f"  flag    {fl}")


def _git_sha() -> str | None:
    if os.environ.get("GITHUB_SHA"):
        return os.environ["GITHUB_SHA"]
    try:
        return subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True, text=True, cwd=PIPELINE_DIR,
                              check=True).stdout.strip() or None
    except Exception:
        return None


def _env(name: str) -> str:
    v = os.environ.get(name)
    if not v:
        raise SystemExit(f"{name} is not set (add it to .env locally, or as a GitHub Actions secret)")
    return v


def run(issuer: str | None = None, isin: str | None = None, skip_download: bool = False, dry_run: bool = False) -> int:
    from dotenv import load_dotenv
    load_dotenv(PIPELINE_DIR.parent / ".env")
    started = dt.datetime.now(dt.timezone.utc)
    etfs = [e for e in load_universe() if (issuer is None or e.issuer == issuer) and (isin is None or e.isin == isin)]
    if not etfs:
        raise SystemExit("no ETFs match the filters")
    ctx = Context(month=started.strftime("%Y-%m"), skip_download=skip_download, dry_run=dry_run,
                  mappings=labels.load_seed_mappings())
    conn = None
    if not dry_run:
        from pipeline.load import Loader, connect
        from pipeline.storage import Storage
        db_url = _env("SUPABASE_DB_URL")
        conn = connect(db_url)
        ctx.loader = Loader(conn, db_url)
        ctx.storage = Storage(_env("SUPABASE_URL"), _env("SUPABASE_SERVICE_ROLE_KEY"))
        ctx.mappings = ctx.loader.mappings()
        ctx.run_id = ctx.loader.start_run(_git_sha())
    if not skip_download:
        ctx.client = PoliteClient()

    results: list[EtfResult] = []
    fx = (None, None, "SKIPPED (filtered run)")
    pruned: list[str] = []
    try:
        for etf in etfs:
            log.info("%s %s (%s)", etf.ticker, etf.isin, etf.issuer)
            results.append(process_etf(etf, ctx))
        if isin is None and issuer is None:
            log.info("ECB FX rates")
            if ctx.loader is not None:
                ctx.loader.ensure_connected()
            fx = process_fx(ctx)
        if ctx.storage is not None and not skip_download:
            try:
                pruned = ctx.storage.prune()
            except Exception as e:
                log.warning("storage pruning failed: %s", e)
    finally:
        if ctx.client:
            ctx.client.close()

    print_summary(results, fx, dry_run)
    failed = [r for r in results if not r.ok] or ([1] if fx[2] == "FAILED" else [])
    summary = {
        "started_at": started.isoformat(), "finished_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "dry_run": dry_run, "skip_download": skip_download, "filters": {"issuer": issuer, "isin": isin},
        "fx": {"rows": fx[0], "error": fx[1], "status": fx[2]}, "storage_months_pruned": pruned,
        "etfs": [{"isin": r.isin, "ticker": r.ticker, "status": r.status, "files": r.files, "rows": r.rows,
                  "warnings": r.warnings, "errors": r.errors, "flags": r.flags} for r in results],
    }
    if ctx.loader is not None:
        status = "failed" if len(failed) == len(results) + (fx[2] == "FAILED") else ("partial" if failed else "success")
        ctx.loader.ensure_connected()
        ctx.loader.finish_run(ctx.run_id, status, summary)
        print(f"\nRun {ctx.run_id} saved to pipeline_runs ({status})")
        ctx.storage.close()
        ctx.loader.conn.close()
    else:
        out = RAW_DIR / ctx.month / "dry_run_summary.json"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(summary, indent=1, default=str))
        print(f"\nSummary saved to {out.relative_to(PIPELINE_DIR.parent)}")
    return 1 if failed else 0
