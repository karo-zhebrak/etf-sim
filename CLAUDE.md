# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Product

An educational ETF portfolio simulator for UK investors. Users learn how ETF portfolios behave by experimenting with simulated portfolios; no real money or real trades are involved.

Keep these in mind when building features:

- **Educational, not advisory.** Present simulations as illustrations. Do not recommend specific investments or tell users what they should buy, and do not imply that simulated or past performance predicts future returns.
- **UK-first.** Default to GBP and UK terminology, formats and investor context.

## Current status

| Layer | Status |
| --- | --- |
| Next.js 16 (App Router), React 19, TypeScript | In place |
| Tailwind CSS 4, shadcn/ui | In place |
| Supabase Postgres (data) | In place: schema applied, data loaded. The app reads it as the signed-in user |
| Supabase Auth | In place: email and password, with email confirmation and password reset (`@supabase/ssr`) |
| Monthly data pipeline (`pipeline/`) | In place: Python, runs locally and via GitHub Actions on the 10th of each month |
| Vercel (hosting) | Planned: not linked or configured |

The app has sign-in pages and a placeholder home page; no simulator features yet. The only tests are the pipeline's pytest suite; the app has no tests or test runner yet.

## Data sources

All market data comes from the monthly pipeline. See `pipeline/README.md` for how it works and what to do when an issuer changes their files.

- **Issuer files**, fetched from each fund's product page:
  - iShares: fund data file (SpreadsheetML XML) and factsheet PDF.
  - HSBC: price history (`.xlsx`), factsheet PDF and full holdings (`.xls`).
- **FX:** ECB euro reference rates, with full history. Reuse is allowed with attribution, so credit the European Central Bank wherever FX-converted figures appear.
- **Universe:** `pipeline/config/etf_universe.yaml`, currently 13 ETFs (10 iShares, 3 HSBC). Only accumulating share classes are in scope, plus a no-income gold ETC. Distributing classes fail validation.
- **Raw issuer files are never committed** (`pipeline/raw/` and `pipeline/samples/` are gitignored). They are kept gzipped in the private Supabase Storage bucket `raw-issuer-files`, and only the last 3 months are kept. Test fixtures must be synthetic.

## Data model

The schema lives in `supabase/migrations/`. Change it only through new migration files.

- **History is kept.** Snapshot tables are keyed by the as-of date printed in the issuer file: `fund_fact_snapshots`, `performance_returns`, `exposures` and `holdings`. Use the `latest_*` views for current values.
- **NAV is total return.** Every fund is accumulating, so `nav_prices` already includes reinvested income, and there is no distributions table. `total_return_index` holds only the iShares growth-of-10,000 series (fund and benchmark); HSBC publishes none.
- **Native currencies.** Series are stored in the share class currency (mostly USD; some GBP and EUR). Convert in queries: `nav_gbp` gives NAVs in GBP, and `fx_gbp` gives the GBP value of each currency per ECB date. Do not store converted values.
- **Flagged data.** Points with `quality = 'flagged'` are suspect issuer data, such as the SWDA benchmark rebasing glitch. Exclude them from charts and calculations; `nav_gbp` already does. Details are in `data_flags`.
- **Labels.** Use `exposures.label_normalised` (GICS-style sectors, ISO countries) to compare funds across issuers, not the raw `label`.
- **Partial data.** `holdings.is_partial = true` means only a top-10 list was available. HSBC full holdings have no sector.
- **Access (RLS).** Signed-in (`authenticated`) users can read the data tables and views. `anon` can read nothing. This is by design: the app requires sign-in, so do not add anonymous read access. Only the service role writes, and that is the pipeline. `pipeline_runs`, `source_files` and `data_flags` are not readable from the app. Never use the service role key in the Next.js app.
- **Tables:**
  - Identity: `etfs`, `listings` (one share class can have several tickers and currencies).
  - Snapshots: `fund_fact_snapshots`, `performance_returns`, `exposures`, `holdings`.
  - Series: `nav_prices`, `total_return_index`, `fx_rates`.
  - Reference: `label_mappings`.
  - Bookkeeping: `data_flags`, `source_files`, `pipeline_runs`.

## Authentication

- **Every page needs sign-in** except `/login`, `/signup`, `/forgot-password` and `/auth/*`. `proxy.ts` refreshes the session cookie and redirects signed-out visitors to `/login?next=…`. Add any new public route to `PUBLIC_PATHS` there.
- **The proxy is only a convenience gate.** Check the session again in every Server Action and Route Handler (`supabase.auth.getClaims()`), and RLS protects the data. Use `getCurrentUser()` from `lib/auth.ts` in Server Components.
- **Supabase clients:** use `createClient()` from `lib/supabase/server.ts` on the server. It reads cookies, so with Cache Components any component that uses it (or `getCurrentUser()`) must render inside `<Suspense>`. Keep session reads out of layouts' top level.
- **Redirects:** pass any user-supplied redirect target through `safeNextPath()` (`lib/auth.ts`).
- **Env:** the app uses `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` only (see `.env.example`).
- **Email links:** auth emails link to `/auth/callback`, which exchanges the code for a session and redirects to `next`. In Supabase Auth settings, the site URL and the `/**` redirect URLs must cover every environment.

## Commands

```bash
npm run dev      # Dev server at http://localhost:3000
npm run build    # Production build
npm run start    # Serve the production build
npm run lint     # ESLint
npx tsc --noEmit # Type-check
npx shadcn@latest add <component>  # Add a shadcn/ui component to components/ui/

# Data pipeline (Python 3.12, run from the repo root; secrets in .env, see .env.example)
python3.12 -m venv pipeline/.venv && pipeline/.venv/bin/pip install -r pipeline/requirements.txt
pipeline/.venv/bin/python -m pipeline run                   # fetch, parse, validate, load
pipeline/.venv/bin/python -m pipeline run --dry-run         # no database or Storage writes
pipeline/.venv/bin/python -m pipeline run --isin <ISIN>     # one ETF (or --issuer ishares|hsbc)
pipeline/.venv/bin/python -m pipeline run --skip-download   # re-parse stored raw files
pipeline/.venv/bin/python -m pytest pipeline/tests -q       # pipeline tests
supabase db push --db-url "$SUPABASE_DB_URL"                # apply new migrations
```

## Project-specific notes

- **Next.js features:** `next.config.ts` enables `cacheComponents` and `partialPrefetching`, which change how data fetching and caching work. Check `node_modules/next/dist/docs/` before writing data-fetching code.
- **Tailwind runs through Turbopack:** CSS goes through the `@tailwindcss/turbopack` loader configured in `next.config.ts`. There is no PostCSS config or `tailwind.config` file; theme tokens live in `app/globals.css`.
- **Tailwind versions are pinned:** `tailwindcss` and `@tailwindcss/turbopack` are pinned to exactly the same version (4.3.3). Upgrade them together. 4.3.3 was chosen because the 4.3.4 release was incomplete on npm when the project was set up.
- **shadcn/ui:** Uses the `base-nova` style, built on `@base-ui/react` rather than Radix. Components in `components/ui/` are owned source code and can be edited directly.
- **`cn()` helper:** Comes from the `cn` npm package, shadcn's replacement for `clsx` + `tailwind-merge`. `lib/utils.ts` re-exports it, and generated components may import from `cn` directly.
- **Import alias:** `@/*` maps to the repo root. There is no `src/` directory.
- **`AGENTS.md`:** Its managed block is rewritten by `next dev`. Put project guidance in this file instead.
