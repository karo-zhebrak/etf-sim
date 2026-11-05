# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Product

An educational ETF portfolio simulator for UK investors. Users learn how ETF portfolios behave by experimenting with simulated portfolios; no real money or real trades are involved.

Keep these in mind when building features:

- **Educational, not advisory.** Present simulations as illustrations. Do not recommend specific investments or tell users what they should buy, and do not imply that simulated or past performance predicts future returns.
- **UK-first.** Default to GBP and UK terminology, formats and investor context.

## v1 feature spec

ETF Portfolio Construction App, spec version 1.0. Users sign in, choose an investment amount, select up to five ETFs, set allocations, analyse the combined portfolio, and save portfolios to revisit later. It should feel like a professional, modern financial analytics dashboard while staying accessible to beginners.

### Structure and navigation

- **Main navigation:** Portfolio Builder, My Portfolios, Account / Settings, Logout.
- **Portfolio Builder** is a step-based workflow:
  1. Investment Amount
  2. ETF Selection, including allocations
  3. Portfolio Analysis

  Users can move back and forth between steps without losing inputs or selections.
- **Main journey:** log in → start a portfolio (amount and currency) → search, explore and select up to 5 ETFs and set allocations → analyse → save → reopen, edit, re-analyse or delete from My Portfolios.

### Features (all MVP)

1. **Authentication** (high)
   - Sign up, log in, log out, forgot password; email and password fields.
   - **Password visibility toggle** (not built yet).
   - Saved portfolios are available after logging in.
2. **Investment amount** (high)
   - A positive amount, with a currency choice of **GBP (default), EUR or USD**.
   - The amount and currency are shown throughout the builder, can be edited until the portfolio is saved, and are kept when moving between steps.
3. **ETF selection** (high)
   - A searchable list showing name and ISIN, with add and remove, a counter (e.g. 3/5), a selected-ETFs panel, and "proceed to analysis".
   - **Maximum 5 ETFs.** Adding a sixth is blocked.
   - The selection is kept when moving between steps.
4. **ETF detail view** (high), opened by clicking an ETF:
   - name, ISIN, benchmark, description, distribution policy, replication method, currency, inception date, TER
   - top 10 constituents
5. **Portfolio allocation** (high)
   - Defaults to equal weights. Users can customise each weight, and the total must equal 100%.
   - Show each ETF's percentage and its monetary amount (e.g. £10,000 across 4 ETFs = 25% / £2,500 each).
   - Analysis updates when allocations change.
6. **Portfolio analysis** (high), available once at least one ETF is selected. Interactive charts with hover values; it updates when the selection or allocations change.
   - **A. Historical performance comparison:** a line chart with one line per selected ETF plus MSCI World, normalised to 100 at a common start, with a legend, hover values and 1Y / 3Y / 5Y / MAX range buttons.
   - **B. Geographic exposure:** the combined portfolio by country or region, with percentages, as an interactive chart.
   - **C. Sector exposure:** the combined portfolio by sector, with percentages, as an interactive chart.
   - **D. Top 10 portfolio constituents:** name and combined exposure (%), with overlapping holdings across ETFs combined; an optional weight visualisation.
   - **E. Correlation matrix:** up to 5×5, with ETF names on both axes, coefficients from -1 to +1, 1.0 on the diagonal, and colour coding for positive, negative and low correlation.
   - **F. Combined portfolio performance:** the portfolio vs MSCI World, both normalised to 100, with range buttons and hover values. It reflects the allocations and fees (see decisions below).
7. **Save portfolio** (high)
   - A "Save Portfolio" button and a name. Saves the name, amount, currency, selected ETFs, allocations and last-modified date.
   - Incomplete portfolios can be saved, before or after analysis. Existing portfolios can be updated. Show a confirmation on save.
8. **My Portfolios** (high)
   - Lists each portfolio's name, number of ETFs, amount, currency and last-modified date, with open and delete.
   - Opening a portfolio resumes editing and re-running the analysis.

**Deferred:** Similar ETFs (spec priority medium). With the current universe no two funds share a benchmark, so it was dropped for now. Do not build it.

**Future enhancements (not v1):** risk metrics (volatility, max drawdown, Sharpe), more benchmarks, optimisation suggestions, automatic overlap identification, ETF comparison mode, PDF/Excel export, sharing, what-if scenarios.

**Out of scope:** brokerage integration, executing trades, payments. Data sourcing is handled by the pipeline.

**Design principles:** simplicity, clarity, visualisation first, consistency, interactivity (hover, filters), and responsive layouts for desktop, tablet and mobile.

### Implementation decisions (agreed 2026-11-05)

- **Benchmark (MSCI World):** use the MSCI World Index (Net) series we already hold. That is `total_return_index` for SWDA (`IE00B4L5Y983`), `series = 'benchmark'`. It is in USD, so convert it to the chosen currency. Exclude flagged points: the series is clean from 2 April 2012. It ends a few days before the latest NAVs.
- **Fees:** NAVs are already net of each fund's TER. Calculate performance from NAVs, label it "after fund fees", and **never subtract the TER again**.
- **Combined portfolio:** buy and hold. Invest at the target weights on the start date, then let the weights drift with prices. There is no rebalancing.
- **Currency:** convert NAVs and the benchmark with ECB rates (`fx_rates`, EUR-based) into GBP, EUR or USD. Credit the ECB.
- **Common start:** normalised charts start at 100 on the latest first-price date among the selected series. Disable range buttons longer than the available history (the HSBC funds start in December 2022 or May 2023, so 5Y is unavailable when one is selected).
- **Correlation:** use weekly returns over the common period. Daily NAVs across time zones understate correlation.
- **Geography:** CSPX, CNDX, CUKX and IJPA have no country breakdown. Treat each as 100% its home country (US, US, UK, Japan) and say so in the UI. Gold (SGLN) is its own "Gold" slice. Use `label_normalised` and ISO codes.
- **Sectors:** show an asset-class split first (equity, bonds, property, gold), then equity sectors by `label_normalised`. Bond sectors (Government, Corporate, …) are not GICS sectors.
- **Constituents:** combined exposure = Σ (ETF weight × holding weight). Match holdings by ISIN where available, by ticker within iShares, otherwise by normalised name. Name matching is imperfect, so label the result approximate. Exclude cash, FX and derivative lines. SGLN shows "Physical gold" rather than a top-10 list.
- **As-of dates:** exposures and holdings differ by issuer (HSBC factsheets lag a month), so show the as-of date.
- **Disclaimer:** show "past performance does not predict future returns" with every performance chart.

## Current status

| Layer | Status |
| --- | --- |
| Next.js 16 (App Router), React 19, TypeScript | In place |
| Tailwind CSS 4, shadcn/ui | In place |
| Supabase Postgres (data) | In place: schema applied, data loaded. The app reads it as the signed-in user |
| Supabase Auth | In place: email and password, with email confirmation and password reset (`@supabase/ssr`) |
| Monthly data pipeline (`pipeline/`) | In place: Python, runs locally and via GitHub Actions on the 10th of each month |
| Vercel (hosting) | Planned: not linked or configured |

The app has sign-in pages (with a password visibility toggle), the signed-in shell with main navigation, a home page and an Account page. Portfolio Builder and My Portfolios are placeholders until their iterations ship. The only tests are the pipeline's pytest suite; the app has no tests or test runner yet.

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
- **Call `getCurrentUser()` before other Supabase reads in a Server Component.** It calls `connection()`, which keeps Supabase out of prerendering. Otherwise Supabase's `Date.now()` token-expiry check errors in the App Shell that partial prefetching renders with cookies.
- **Layout:** signed-in pages live in the `app/(app)/` route group, whose layout has the main navigation (`components/app-nav.tsx`). Auth pages live in `app/(auth)/`.
- **Hidden previous pages:** Cache Components keeps recently visited pages mounted but hidden (React Activity). In browser tests, query visible elements only, e.g. `h1 >> visible=true`.
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
