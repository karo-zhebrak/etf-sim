# Monthly ETF data pipeline

A plain Python pipeline that downloads issuer data files for the ETFs in
`config/etf_universe.yaml`, parses and validates them, and loads them into Supabase
Postgres. It runs with no AI involvement: locally with one command, and on the 10th of
each month via GitHub Actions (`.github/workflows/monthly-data.yml`).

## What it fetches

| Source | Files | Used for |
| --- | --- | --- |
| iShares product page | Fund data file (SpreadsheetML XML, labelled `.xls`), factsheet PDF | Facts, daily NAV, growth-of-10,000 fund and benchmark series, returns, exposures, full holdings; description from the factsheet |
| HSBC individual-investor fund page | Price history (`.xlsx`), factsheet PDF, full holdings (`.xls`) | Daily NAV; facts, returns, allocations and listings from the factsheet; full holdings |
| ECB | Euro reference rates, full history (zip) | FX. Source: European Central Bank; reuse allowed with attribution |

The universe is **accumulating share classes only** (plus a no-income gold ETC), so each
fund's NAV series is its total-return series. Distributing classes fail validation.

Download links are discovered from each page at run time. Requests use plain HTTP, wait
at least 3 seconds between requests to the same host, retry at most 3 times with
exponential backoff, and send a descriptive User-Agent.

**Raw issuer files must never be committed.** `pipeline/raw/` and `pipeline/samples/` are
gitignored. Raw files are kept gzipped in the private Supabase Storage bucket
`raw-issuer-files` at `{yyyy-mm}/{issuer}/{isin}/{file}.gz`, and only the last 3 monthly
runs are kept. Test fixtures are synthetic.

## Setup

```bash
python3.12 -m venv pipeline/.venv
pipeline/.venv/bin/pip install -r pipeline/requirements.txt
cp .env.example .env   # then fill in the three values
```

The database schema lives in `supabase/migrations/`. To apply new migrations:

```bash
supabase db push --db-url "$SUPABASE_DB_URL"
```

GitHub Actions needs three repository secrets (Settings > Secrets and variables > Actions):
`SUPABASE_URL`, `SUPABASE_DB_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

## Running

Run from the repo root:

```bash
pipeline/.venv/bin/python -m pipeline run              # everything: fetch, parse, validate, load
pipeline/.venv/bin/python -m pipeline run --dry-run    # parse and validate only; no DB or Storage writes
pipeline/.venv/bin/python -m pipeline run --isin IE00B4L5Y983   # one ETF
pipeline/.venv/bin/python -m pipeline run --issuer hsbc         # one issuer
pipeline/.venv/bin/python -m pipeline run --skip-download       # re-parse the latest stored raw files
pipeline/.venv/bin/python -m pytest pipeline/tests -q           # unit tests
```

Add `-v` for debug logging with tracebacks.

**Monthly by hand:** run `python -m pipeline run`. It prints a summary table (files fetched,
rows loaded per table, warnings, flags, errors per ETF), saves it to `pipeline_runs`, and
exits non-zero if any ETF or the FX load failed. One ETF failing never stops the others.

**Re-running one ETF:** `--isin <ISIN>`. Add `--skip-download` to re-parse what is already
stored (local `pipeline/raw/` first, then Storage). This is the way to reload after fixing
a parser, because it ignores the unchanged-file check. Filtered runs skip FX.

From GitHub: Actions > Monthly ETF data > Run workflow, with optional issuer, ISIN and
skip-download inputs.

## How loading works

- Every snapshot is keyed by the as-of date printed in the file, so monthly runs build history.
- Time series (`nav_prices`, `total_return_index`, `fx_rates`) are upserted; a row is only
  written if a value changed. Snapshots (`exposures`, `holdings`, `performance_returns`) are
  replaced per `(isin, as_of)` in one transaction per ETF.
- A file whose SHA-256 matches one already loaded successfully (`source_files`) is not
  re-parsed. HSBC generates its price-history spreadsheet on request, so its bytes differ
  every run and it is always re-parsed; the upsert then writes nothing if the data is the same.
- Running twice in a month leaves the data unchanged.

## Validation

| Check | Result |
| --- | --- |
| ISIN in each file matches the config | Error: the ETF fails |
| Share class is distributing | Error |
| TER outside 0–2% | Error |
| Conflicting values for the same date | Error |
| No NAV history (when the NAV file was parsed) | Error |
| Exact duplicate dates | Dropped, warning |
| Day-on-day move above 25% | Point loaded with `quality = 'flagged'`, row in `data_flags` |
| iShares benchmark index more than 25% away from its fund index | Points flagged (catches the known benchmark rebasing glitch) |
| Exposure or full-holdings weights not within 100% ± 2 | Warning and data flag |
| Sector/country label not in `label_mappings` | Warning; `label_normalised` left null |

Views such as `nav_gbp` exclude flagged points.

## When an issuer changes their page or file format

The run fails loudly for the affected ETFs and keeps going for the rest. The job fails, and
GitHub emails the repo owner.

1. Read the error in the summary (GitHub: the job summary, or `pipeline_runs.summary`).
   Typical messages: "download link not found", "columns changed", "no 'Date' header row".
2. Get the new file: run `--isin <ISIN> --dry-run` locally. Raw files land in
   `pipeline/raw/<yyyy-mm>/...`.
3. Fix the code:
   - Link discovery: `pipeline/fetch/ishares.py` (regexes for the download links),
     `pipeline/fetch/hsbc.py` (page settings, token and API flow).
   - Parsing: `pipeline/parse/`. Each parser is a pure function from bytes to typed records.
4. Update the synthetic fixture in `pipeline/tests/` to copy the new structure, and add a test.
5. Re-run `--isin <ISIN> --skip-download --dry-run`, then without `--dry-run`.

**New labels:** add rows to `label_mappings` in a new migration. Scopes: `'*'` for all,
an issuer (`'hsbc'`), an asset class (`'fixed_income'`, `'property'`), or
`'<issuer>_<asset class>'`. The most specific scope wins.

**Changing the universe:** edit `config/etf_universe.yaml`. Check that the share class is
accumulating, and check its currency and how far back its price history goes.

## Code layout

```
pipeline/
  __main__.py      CLI
  run.py           orchestration and summary
  config.py        universe loading;  config/etf_universe.yaml
  net.py           polite HTTP client
  fetch/           ishares.py, hsbc.py
  parse/           ishares_data.py, ishares_factsheet.py, hsbc_tables.py, hsbc_factsheet.py, pdf_text.py
  fx.py            ECB rates
  labels.py        label normalisation
  validate.py      validation and data flags
  load.py          idempotent Postgres loads
  storage.py       Supabase Storage (raw files)
  tests/           pytest, synthetic fixtures
```
