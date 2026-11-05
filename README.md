# ETF Portfolio Simulator

**An educational web app for UK investors: build a simulated portfolio of up to five ETFs and see how it would have behaved: its performance, where it invests, what it holds and how its funds move together.**

Live at **[etfportfoliosimulator.com](https://etfportfoliosimulator.com)** (free account required).

> **Educational, not advice.** Everything in the app is a simulation for learning. It doesn't recommend investments, and past performance does not predict future returns. No real money or trades are involved.

---

## What you can do

1. **Choose an amount:** a lump sum in GBP, EUR or USD.
2. **Pick up to five ETFs:** search by name, ISIN or ticker, and open any fund for its key facts, description and top 10 holdings.
3. **Set the allocation:** equal weights by default, or your own percentages (they must add up to 100%), with the amount going into each fund.
4. **Analyse the portfolio:**

   | Chart | What it shows |
   | --- | --- |
   | **Historical performance** | Each ETF against the MSCI World Index, starting from 100, over 1, 3 or 5 years or the full history |
   | **Geographic exposure** | Where the money is invested, by country or region |
   | **Sector exposure** | Equity, bonds, property and gold, then the equity part by sector |
   | **Top 10 constituents** | The largest holdings across the whole portfolio, with overlaps between ETFs added together |
   | **Correlation matrix** | How closely the funds move together, from −1 to +1 |
   | **Combined performance** | What your amount would have grown to, against MSCI World |

5. **Save portfolios** to your account, and reopen, edit or delete them from **My Portfolios**.

Every chart has hover values, a table view and its data sources. Performance is shown after each fund's ongoing charge (TER), with income reinvested.

## How it works

```
Issuer websites (iShares, HSBC)  ─┐
ECB euro reference rates          ├─▶  Python data pipeline  ─▶  Supabase Postgres  ─▶  Next.js app
                                  ┘    (monthly, GitHub Actions)                         (Vercel)
```

- **Data pipeline** ([`pipeline/`](pipeline/README.md)): a plain Python job that runs on the 10th of each month. It downloads each fund's data files and factsheets, parses and validates them, and loads them into Postgres. It keeps history (every snapshot is dated), flags suspect issuer data rather than silently loading it, and stores raw files privately in Supabase Storage.
- **Database** ([`supabase/migrations/`](supabase/migrations)): prices, facts, holdings, exposures, FX rates and users' portfolios. Row-level security means signed-in users can read market data, but each person can only see and change their own portfolios.
- **App:** Next.js (App Router) with Supabase Auth (email and password, with email confirmation). The calculations live in small, unit-tested TypeScript modules in [`lib/`](lib):
  - `performance.ts`: normalising to 100, date ranges, buy-and-hold portfolio growth
  - `exposure.ts`: combined country, region, sector and asset-class weights
  - `constituents.ts`: matching the same company across issuers (e.g. "APPLE" and "Apple Inc")
  - `correlation.ts`: weekly-return Pearson correlation

### Modelling choices

- **Prices** are daily NAVs, which are net of each fund's TER, so fees are never deducted twice.
- **Currency:** NAVs are converted with European Central Bank reference rates at query time.
- **Combined portfolio:** buy and hold. It is invested at your weights on the start date and never rebalanced, with no platform fees, dealing costs or taxes.
- **Correlation** uses weekly returns, because daily NAVs of funds in different time zones understate it.
- **Holdings overlap** is matched by ISIN where available, otherwise by normalised company name, so it is labelled approximate.
- **Benchmark:** the MSCI World Index (Net) series published in the iShares SWDA data file.

## Tech stack

| Layer | Technology |
| --- | --- |
| App | Next.js 16 (App Router, Cache Components), React 19, TypeScript |
| UI | Tailwind CSS 4, shadcn/ui (Base UI), Recharts |
| Data and auth | Supabase (Postgres, Auth, Storage) |
| Pipeline | Python 3.12 (httpx, pdfplumber, openpyxl, psycopg) |
| Hosting | Vercel; auth emails via Resend |
| Tests | Vitest (app calculations), pytest (pipeline), Playwright and axe-core checks during development |

## Running it locally

**Prerequisites:** Node.js, Python 3.12, and a Supabase project.

```bash
# 1. Install
npm install
cp .env.example .env            # fill in your Supabase values

# 2. Database
supabase db push --db-url "$SUPABASE_DB_URL"

# 3. Load market data
python3.12 -m venv pipeline/.venv
pipeline/.venv/bin/pip install -r pipeline/requirements.txt
pipeline/.venv/bin/python -m pipeline run

# 4. Run the app
npm run dev                     # http://localhost:3000
```

Useful commands:

```bash
npm test                        # unit tests for the calculations
npm run lint && npx tsc --noEmit
pipeline/.venv/bin/python -m pytest pipeline/tests -q
pipeline/.venv/bin/python -m pipeline run --dry-run   # parse and validate without writing
```

More detail:
- [`pipeline/README.md`](pipeline/README.md): the data pipeline, including how to re-run one fund and what to do when an issuer changes its files.
- [`CLAUDE.md`](CLAUDE.md): the feature spec, data model and coding conventions.

## Data sources and credits

- **Fund data:** published by the fund issuers (iShares by BlackRock and HSBC Asset Management) on their public product pages.
- **Exchange rates:** European Central Bank euro foreign exchange reference rates.
- **Benchmark:** MSCI World Index (Net), as published in the iShares SWDA fund data file.

This project is not affiliated with or endorsed by BlackRock, HSBC, MSCI or the ECB. All fund, index and company names belong to their respective owners.
