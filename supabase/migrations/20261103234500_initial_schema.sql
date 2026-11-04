-- Initial schema for the monthly ETF data pipeline.
--
-- Principles
-- * History is kept: every snapshot is keyed by the as-of date printed in the issuer file,
--   never the run date, so monthly runs accumulate history.
-- * Loads are idempotent: time series upsert on natural keys; snapshots are replaced per
--   (isin, as_of) inside one transaction by the pipeline.
-- * Universe is accumulating share classes only (plus no-income ETCs), so each fund's NAV
--   series is its total-return series. There is no distributions table.
-- * Series are stored in their native currency; GBP conversion happens in views.
-- * Data tables are readable by authenticated users and writable only by the service role
--   (which bypasses RLS). Pipeline bookkeeping tables are not readable by app users.

-- ---------------------------------------------------------------------------
-- Pipeline bookkeeping
-- ---------------------------------------------------------------------------

create table public.pipeline_runs (
  id          bigint generated always as identity primary key,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  status      text not null default 'running'
              check (status in ('running', 'success', 'partial', 'failed')),
  git_sha     text,
  summary     jsonb
);

-- ---------------------------------------------------------------------------
-- Identity and static facts
-- ---------------------------------------------------------------------------

create table public.etfs (
  isin                 text primary key check (isin ~ '^[A-Z]{2}[A-Z0-9]{9}[0-9]$'),
  issuer               text not null check (issuer in ('ishares', 'hsbc')),
  primary_ticker       text,           -- display ticker: the GBP London line where one exists
  name                 text not null,
  share_class_currency text check (share_class_currency ~ '^[A-Z]{3}$'),
  base_currency        text check (base_currency ~ '^[A-Z]{3}$'),
  domicile             text,
  benchmark_index      text,
  benchmark_key        text,           -- issuer's benchmark ticker, e.g. NDDUWI
  distribution         text not null check (distribution in ('acc', 'none')),
  replication          text check (replication in ('physical', 'physical_sampled', 'synthetic')),
  asset_class          text check (asset_class in ('equity', 'fixed_income', 'commodity', 'property', 'multi_asset')),
  inception_date       date,           -- share class launch date
  fund_launch_date     date,
  description          text,
  product_url          text not null,
  factsheet_url        text,
  isa_eligible         boolean,
  uk_reporting         boolean,
  updated_at           timestamptz not null default now()
);

comment on column public.etfs.distribution is
  'acc = accumulating share class; none = no-income product such as a physical gold ETC. Distributing classes are out of scope.';

-- One share class can trade under several tickers (e.g. a USD and a GBP line in London).
create table public.listings (
  isin             text not null references public.etfs (isin) on delete cascade,
  exchange         text not null,      -- MIC where known, e.g. XLON
  ticker           text not null,
  trading_currency text check (trading_currency ~ '^[A-Z]{3}$'),
  primary key (isin, exchange, ticker)
);

-- ---------------------------------------------------------------------------
-- Snapshots (keyed by as-of date)
-- ---------------------------------------------------------------------------

create table public.fund_fact_snapshots (
  isin                  text not null references public.etfs (isin) on delete cascade,
  as_of                 date not null,
  ter                   numeric,       -- percent, e.g. 0.20 = 0.20%
  net_assets            numeric,       -- share class where available, else fund
  net_assets_currency   text,
  shares_outstanding    numeric,
  n_holdings            integer,
  pe                    numeric,
  pb                    numeric,
  std_3y                numeric,       -- percent
  beta_3y               numeric,
  yield_to_maturity     numeric,       -- percent, bond funds
  effective_duration    numeric,       -- years, bond funds
  weighted_avg_maturity numeric,       -- years, bond funds
  ounces_in_trust       numeric,       -- gold ETCs
  extra                 jsonb not null default '{}'::jsonb,  -- issuer-specific facts not modelled yet
  primary key (isin, as_of)
);

create table public.performance_returns (
  isin             text not null references public.etfs (isin) on delete cascade,
  as_of            date not null,
  period_type      text not null check (period_type in ('discrete', 'annualised', 'cumulative', 'calendar')),
  period_label     text not null,      -- e.g. '1y', '2025', '2025-09-30/2026-09-30'
  fund_return      numeric,            -- percent
  benchmark_return numeric,            -- percent
  currency         text check (currency ~ '^[A-Z]{3}$'),  -- share class currency the return is quoted in
  source           text not null check (source in ('data_file', 'factsheet')),
  primary key (isin, as_of, period_type, period_label)
);

create table public.exposures (
  isin             text not null references public.etfs (isin) on delete cascade,
  as_of            date not null,
  kind             text not null check (kind in ('sector', 'country', 'region', 'asset_class', 'maturity', 'credit_quality')),
  label            text not null,      -- as printed by the issuer
  label_normalised text,               -- from label_mappings; null if unmapped (logged as a warning)
  iso_code         text,
  weight           numeric not null,   -- percent
  primary key (isin, as_of, kind, label)
);

create table public.holdings (
  isin           text not null references public.etfs (isin) on delete cascade,
  as_of          date not null,
  rank           integer not null,     -- order in the issuer file
  name           text not null,
  issuer_ticker  text,
  security_isin  text,
  sector         text,
  asset_class    text,
  country        text,
  weight         numeric,              -- percent
  market_value   numeric,
  currency       text,
  is_partial     boolean not null,     -- true when only a top-N list was available
  primary key (isin, as_of, rank)
);

-- ---------------------------------------------------------------------------
-- Time series
-- ---------------------------------------------------------------------------

create table public.nav_prices (
  isin     text not null references public.etfs (isin) on delete cascade,
  date     date not null,
  nav      numeric not null,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  quality  text not null default 'ok' check (quality in ('ok', 'flagged')),
  primary key (isin, date)
);

comment on table public.nav_prices is
  'Daily NAV per share in the share class currency. All funds are accumulating, so this is a total-return series.';

-- Issuer-published growth-of-10,000 series (iShares only: fund and benchmark).
create table public.total_return_index (
  isin    text not null references public.etfs (isin) on delete cascade,
  series  text not null check (series in ('fund', 'benchmark')),
  date    date not null,
  value   numeric not null,
  quality text not null default 'ok' check (quality in ('ok', 'flagged')),
  primary key (isin, series, date)
);

create table public.fx_rates (
  date   date not null,
  base   text not null check (base ~ '^[A-Z]{3}$'),
  quote  text not null check (quote ~ '^[A-Z]{3}$'),
  rate   numeric not null,             -- 1 base = rate quote
  source text not null,
  primary key (date, base, quote)
);

create index fx_rates_pair_date_idx on public.fx_rates (base, quote, date desc);

-- ---------------------------------------------------------------------------
-- Reference data and data quality
-- ---------------------------------------------------------------------------

create table public.label_mappings (
  kind             text not null check (kind in ('sector', 'country', 'region', 'asset_class', 'maturity', 'credit_quality')),
  issuer           text not null default '*',   -- scope: '*' (all), an issuer, or '<issuer>_<asset_class>'
  source_label     text not null,
  normalised_label text not null,
  iso_code         text,
  primary key (kind, issuer, source_label)
);

create table public.data_flags (
  id         bigint generated always as identity primary key,
  run_id     bigint references public.pipeline_runs (id) on delete set null,
  isin       text references public.etfs (isin) on delete cascade,
  table_name text not null,
  date       date,
  kind       text not null,            -- e.g. 'jump_gt_25pct', 'weights_sum'
  detail     text,
  created_at timestamptz not null default now()
);

create table public.source_files (
  id           bigint generated always as identity primary key,
  run_id       bigint references public.pipeline_runs (id) on delete set null,
  isin         text,
  issuer       text not null,
  file_type    text not null,          -- e.g. 'ishares_fund_data', 'hsbc_factsheet', 'ecb_fx'
  url          text not null,
  fetched_at   timestamptz not null default now(),
  sha256       text not null,
  size_bytes   bigint,
  storage_path text,
  parse_status text not null default 'pending'
               check (parse_status in ('pending', 'ok', 'failed', 'skipped_unchanged')),
  error        text,
  unique (isin, file_type, sha256)
);

-- ---------------------------------------------------------------------------
-- Views (security_invoker so the caller's RLS applies)
-- ---------------------------------------------------------------------------

create view public.latest_fund_facts with (security_invoker = true) as
select distinct on (isin) *
from public.fund_fact_snapshots
order by isin, as_of desc;

create view public.latest_exposures with (security_invoker = true) as
select e.*
from public.exposures e
join (
  select isin, kind, max(as_of) as as_of from public.exposures group by isin, kind
) m using (isin, kind, as_of);

create view public.latest_holdings with (security_invoker = true) as
select h.*
from public.holdings h
join (select isin, max(as_of) as as_of from public.holdings group by isin) m using (isin, as_of);

create view public.latest_performance with (security_invoker = true) as
select p.*
from public.performance_returns p
join (
  select isin, period_type, source, max(as_of) as as_of
  from public.performance_returns group by isin, period_type, source
) m using (isin, period_type, source, as_of);

-- GBP value of one unit of each currency on each ECB date. ECB rates are EUR-based:
-- GBP per X = (EUR->GBP) / (EUR->X).
create view public.fx_gbp with (security_invoker = true) as
select g.date, 'GBP'::text as currency, 1::numeric as gbp_per_unit
from public.fx_rates g where g.base = 'EUR' and g.quote = 'GBP'
union all
select g.date, 'EUR', g.rate
from public.fx_rates g where g.base = 'EUR' and g.quote = 'GBP'
union all
select g.date, x.quote, g.rate / x.rate
from public.fx_rates g
join public.fx_rates x on x.date = g.date and x.base = 'EUR' and x.quote not in ('GBP', 'EUR')
where g.base = 'EUR' and g.quote = 'GBP';

-- NAVs converted to GBP, using the latest ECB rate on or before each NAV date
-- (carries rates forward over weekends and ECB holidays). Excludes flagged points.
create view public.nav_gbp with (security_invoker = true) as
select n.isin, n.date, n.nav, n.currency,
       fx.date as fx_date, fx.gbp_per_unit,
       n.nav * fx.gbp_per_unit as nav_gbp
from public.nav_prices n
cross join lateral (
  select f.date, f.gbp_per_unit
  from public.fx_gbp f
  where f.currency = n.currency and f.date <= n.date
  order by f.date desc
  limit 1
) fx
where n.quality = 'ok';

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.pipeline_runs       enable row level security;
alter table public.etfs                enable row level security;
alter table public.listings            enable row level security;
alter table public.fund_fact_snapshots enable row level security;
alter table public.performance_returns enable row level security;
alter table public.exposures           enable row level security;
alter table public.holdings            enable row level security;
alter table public.nav_prices          enable row level security;
alter table public.total_return_index  enable row level security;
alter table public.fx_rates            enable row level security;
alter table public.label_mappings      enable row level security;
alter table public.data_flags          enable row level security;
alter table public.source_files        enable row level security;

-- Read access for signed-in users on data tables. No insert/update/delete policies:
-- only the service role (which bypasses RLS) writes. pipeline_runs, data_flags and
-- source_files get no policy, so app users cannot read them.
create policy "authenticated read" on public.etfs                for select to authenticated using (true);
create policy "authenticated read" on public.listings            for select to authenticated using (true);
create policy "authenticated read" on public.fund_fact_snapshots for select to authenticated using (true);
create policy "authenticated read" on public.performance_returns for select to authenticated using (true);
create policy "authenticated read" on public.exposures           for select to authenticated using (true);
create policy "authenticated read" on public.holdings            for select to authenticated using (true);
create policy "authenticated read" on public.nav_prices          for select to authenticated using (true);
create policy "authenticated read" on public.total_return_index  for select to authenticated using (true);
create policy "authenticated read" on public.fx_rates            for select to authenticated using (true);
create policy "authenticated read" on public.label_mappings      for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Storage: private bucket for gzipped raw issuer files ({yyyy-mm}/{issuer}/{isin}/{file})
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('raw-issuer-files', 'raw-issuer-files', false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Seed: normalised label taxonomy
-- ---------------------------------------------------------------------------

-- Sectors: GICS sector names, plus cash and other.
insert into public.label_mappings (kind, issuer, source_label, normalised_label) values
  ('sector', '*', 'Information Technology',  'Information Technology'),
  ('sector', '*', 'Financials',              'Financials'),
  ('sector', '*', 'Industrials',             'Industrials'),
  ('sector', '*', 'Health Care',             'Health Care'),
  ('sector', '*', 'Consumer Discretionary',  'Consumer Discretionary'),
  ('sector', '*', 'Communication',           'Communication Services'),
  ('sector', '*', 'Communication Services',  'Communication Services'),
  ('sector', '*', 'Consumer Staples',        'Consumer Staples'),
  ('sector', '*', 'Energy',                  'Energy'),
  ('sector', '*', 'Materials',               'Materials'),
  ('sector', '*', 'Utilities',               'Utilities'),
  ('sector', '*', 'Real Estate',             'Real Estate'),
  ('sector', '*', 'Cash and/or Derivatives', 'Cash & Derivatives'),
  ('sector', '*', 'Cash and Derivatives',    'Cash & Derivatives'),
  ('sector', '*', 'Cash & Others',           'Cash & Derivatives'),
  ('sector', '*', 'Cash',                    'Cash & Derivatives'),
  ('sector', '*', 'Other',                   'Other'),
  ('sector', '*', 'Others',                  'Other'),
  ('sector', '*', 'Other Sectors',           'Other'),
  -- Fixed income sectors
  ('sector', '*', 'Treasury',                'Government'),
  ('sector', '*', 'Government',              'Government'),
  ('sector', '*', 'Government Related',      'Government Related'),
  ('sector', '*', 'Agency',                  'Government Related'),
  ('sector', '*', 'Supranational',           'Government Related'),
  ('sector', '*', 'Sovereign',               'Government'),
  ('sector', '*', 'Corporates',              'Corporate'),
  ('sector', '*', 'Corporate',               'Corporate'),
  ('sector', '*', 'Securitized',             'Securitised'),
  ('sector', '*', 'Securitised',             'Securitised'),
  ('sector', '*', 'Covered',                 'Securitised'),
  ('sector', '*', 'Treasuries',              'Government'),
  ('sector', '*', 'Agencies',                'Government Related'),
  ('sector', '*', 'Local Authority',         'Government Related'),
  ('sector', '*', 'Financial Institutions',  'Corporate'),
  -- FTSE ICB industry names used by some HSBC equity factsheets, mapped to the nearest GICS sector.
  ('sector', '*', 'Technology',              'Information Technology'),
  ('sector', '*', 'Telecommunications',      'Communication Services'),
  ('sector', '*', 'Basic Materials',         'Materials'),
  -- Bond funds use Bloomberg classification for sectors. These rows are scoped to
  -- 'fixed_income' (any issuer's bond funds) so they cannot collide with equity sector names.
  ('sector', 'fixed_income', 'Industrial',           'Corporate'),
  ('sector', 'fixed_income', 'Utility',              'Corporate'),
  ('sector', 'fixed_income', 'Consumer Non Cyclical','Corporate'),
  ('sector', 'fixed_income', 'Consumer Cyclical',    'Corporate'),
  ('sector', 'fixed_income', 'Technology',           'Corporate'),
  ('sector', 'fixed_income', 'Capital Goods',        'Corporate'),
  ('sector', 'fixed_income', 'Communications',       'Corporate'),
  ('sector', 'fixed_income', 'Basic Industry',       'Corporate'),
  ('sector', 'fixed_income', 'Transportation',       'Corporate'),
  ('sector', 'fixed_income', 'Electric',             'Corporate'),
  ('sector', 'fixed_income', 'Natural Gas',          'Corporate'),
  ('sector', 'fixed_income', 'Insurance',            'Corporate'),
  ('sector', 'fixed_income', 'Banking',              'Corporate'),
  ('sector', 'fixed_income', 'Finance Companies',    'Corporate'),
  ('sector', 'fixed_income', 'REITs',                'Corporate'),
  ('sector', 'fixed_income', 'Healthcare', 'Corporate'),
  ('sector', 'fixed_income', 'Consumer Non-Cyclical', 'Corporate'),
  ('sector', 'fixed_income', 'Reits', 'Corporate'),
  ('sector', 'fixed_income', 'Brokerage/Asset Managers/Exchanges', 'Corporate'),
  ('sector', 'fixed_income', 'Industrial Other', 'Corporate'),
  ('sector', 'fixed_income', 'Utility Other', 'Corporate'),
  ('sector', 'fixed_income', 'Financial Other', 'Corporate'),
  ('sector', 'fixed_income', 'Energy', 'Corporate'),
  ('sector', 'fixed_income', 'Agency Fixed Rate', 'Securitised'),
  ('sector', 'fixed_income', 'Mortgage Collateralized', 'Securitised'),
  ('sector', 'fixed_income', 'Public Sector Collateralized', 'Securitised'),
  ('sector', 'fixed_income', 'Hybrid Collateralized', 'Securitised'),
  ('sector', 'fixed_income', 'CMBS', 'Securitised'),
  ('sector', 'fixed_income', 'Covered Other', 'Securitised'),
  ('sector', 'fixed_income', 'Whole Business', 'Securitised'),
  ('sector', 'fixed_income', 'Stranded Cost Utility', 'Securitised'),
  ('sector', 'fixed_income', 'ABS Other', 'Securitised'),
  ('sector', 'fixed_income', 'Auto Backed', 'Securitised'),
  ('sector', 'fixed_income', 'Credit Card', 'Securitised'),
  ('sector', 'fixed_income', 'Residential Mortgage', 'Securitised'),
  ('sector', 'fixed_income', 'Owned No Guarantee', 'Government Related'),
  ('sector', 'fixed_income', 'Local Government', 'Government Related'),
  ('sector', 'fixed_income', 'Government Guaranteed', 'Government Related'),
  ('sector', 'fixed_income', 'Local Government Guarantee', 'Government Related'),
  ('sector', 'fixed_income', 'Local Government No Guarantee', 'Government Related'),
  ('sector', 'fixed_income', 'Government Sponsored', 'Government Related'),
  -- Property funds report FTSE/ICB real estate sub-sectors, scoped to 'property'.
  ('sector', 'property', 'Retail Reits', 'Real Estate'),
  ('sector', 'property', 'Other Specialty REITs', 'Real Estate'),
  ('sector', 'property', 'Residential Reits', 'Real Estate'),
  ('sector', 'property', 'Real Estate Holding and Development', 'Real Estate'),
  ('sector', 'property', 'Diversified Reits', 'Real Estate'),
  ('sector', 'property', 'Office REITs', 'Real Estate'),
  ('sector', 'property', 'Hotel and Lodging REITs', 'Real Estate'),
  ('sector', 'property', 'Industrial REITs', 'Real Estate'),
  ('sector', 'property', 'Health Care REITs', 'Real Estate'),
  ('sector', 'property', 'Storage REITs', 'Real Estate'),
  ('sector', 'property', 'Real Estate Services', 'Real Estate'),
  ('sector', 'property', 'Hotels and Motels', 'Consumer Discretionary'),
  ('sector', 'property', 'Computer Services', 'Information Technology');

-- Credit quality: letter rating buckets.
insert into public.label_mappings (kind, issuer, source_label, normalised_label) values
  ('credit_quality', '*', 'AAA',       'AAA'),
  ('credit_quality', '*', 'AAA Rated', 'AAA'),
  ('credit_quality', '*', 'AA',        'AA'),
  ('credit_quality', '*', 'AA Rated',  'AA'),
  ('credit_quality', '*', 'A',         'A'),
  ('credit_quality', '*', 'A Rated',   'A'),
  ('credit_quality', '*', 'BBB',       'BBB'),
  ('credit_quality', '*', 'BBB Rated', 'BBB'),
  ('credit_quality', '*', 'BB',        'BB'),
  ('credit_quality', '*', 'BB Rated',  'BB'),
  ('credit_quality', '*', 'B',         'B'),
  ('credit_quality', '*', 'B Rated',   'B'),
  ('credit_quality', '*', 'CCC',       'CCC and below'),
  ('credit_quality', '*', 'Not Rated', 'Not rated'),
  ('credit_quality', '*', 'NR',        'Not rated'),
  ('credit_quality', '*', 'Cash',      'Cash & Derivatives'),
  ('credit_quality', '*', 'Cash and/or Derivatives', 'Cash & Derivatives');

-- Maturity: iShares buckets (HSBC's maturity table is duration contribution, not weights,
-- and is not loaded).
insert into public.label_mappings (kind, issuer, source_label, normalised_label) values
  ('maturity', '*', '0 - 1 Years',   '0-1y'),
  ('maturity', '*', '1 - 2 Years',   '1-2y'),
  ('maturity', '*', '2 - 3 Years',   '2-3y'),
  ('maturity', '*', '3 - 5 Years',   '3-5y'),
  ('maturity', '*', '5 - 7 Years',   '5-7y'),
  ('maturity', '*', '7 - 10 Years',  '7-10y'),
  ('maturity', '*', '10 - 15 Years', '10-15y'),
  ('maturity', '*', '15 - 20 Years', '15-20y'),
  ('maturity', '*', '20+ Years',     '20y+'),
  ('maturity', '*', 'Cash and Derivatives', 'Cash & Derivatives'),
  ('maturity', '*', 'Cash and/or Derivatives', 'Cash & Derivatives');

-- Countries: normalised to the English short name, with ISO 3166-1 alpha-2 code.
insert into public.label_mappings (kind, issuer, source_label, normalised_label, iso_code) values
  ('country', '*', 'United States',  'United States',  'US'),
  ('country', '*', 'Japan',          'Japan',          'JP'),
  ('country', '*', 'United Kingdom', 'United Kingdom', 'GB'),
  ('country', '*', 'Canada',         'Canada',         'CA'),
  ('country', '*', 'Switzerland',    'Switzerland',    'CH'),
  ('country', '*', 'France',         'France',         'FR'),
  ('country', '*', 'Germany',        'Germany',        'DE'),
  ('country', '*', 'Australia',      'Australia',      'AU'),
  ('country', '*', 'Netherlands',    'Netherlands',    'NL'),
  ('country', '*', 'Spain',          'Spain',          'ES'),
  ('country', '*', 'Italy',          'Italy',          'IT'),
  ('country', '*', 'Sweden',         'Sweden',         'SE'),
  ('country', '*', 'Denmark',        'Denmark',        'DK'),
  ('country', '*', 'Finland',        'Finland',        'FI'),
  ('country', '*', 'Norway',         'Norway',         'NO'),
  ('country', '*', 'Belgium',        'Belgium',        'BE'),
  ('country', '*', 'Ireland',        'Ireland',        'IE'),
  ('country', '*', 'Austria',        'Austria',        'AT'),
  ('country', '*', 'Portugal',       'Portugal',       'PT'),
  ('country', '*', 'Hong Kong',      'Hong Kong',      'HK'),
  ('country', '*', 'Hong Kong (SAR)','Hong Kong',      'HK'),
  ('country', '*', 'Singapore',      'Singapore',      'SG'),
  ('country', '*', 'New Zealand',    'New Zealand',    'NZ'),
  ('country', '*', 'Israel',         'Israel',         'IL'),
  ('country', '*', 'China',          'China',          'CN'),
  ('country', '*', 'Mainland China', 'China',          'CN'),
  ('country', '*', 'Supranational',  'Supranational',  null),
  ('country', '*', 'Cash',           'Cash & Derivatives', null),
  ('country', '*', 'Taiwan',         'Taiwan',         'TW'),
  ('country', '*', 'India',          'India',          'IN'),
  ('country', '*', 'Korea (South)',  'South Korea',    'KR'),
  ('country', '*', 'South Korea',    'South Korea',    'KR'),
  ('country', '*', 'Korea',          'South Korea',    'KR'),
  ('country', '*', 'Brazil',         'Brazil',         'BR'),
  ('country', '*', 'Saudi Arabia',   'Saudi Arabia',   'SA'),
  ('country', '*', 'South Africa',   'South Africa',   'ZA'),
  ('country', '*', 'Mexico',         'Mexico',         'MX'),
  ('country', '*', 'Indonesia',      'Indonesia',      'ID'),
  ('country', '*', 'Thailand',       'Thailand',       'TH'),
  ('country', '*', 'Malaysia',       'Malaysia',       'MY'),
  ('country', '*', 'United Arab Emirates', 'United Arab Emirates', 'AE'),
  ('country', '*', 'Poland',         'Poland',         'PL'),
  ('country', '*', 'Other',          'Other',          null),
  ('country', '*', 'Other Locations','Other',          null),
  ('country', '*', 'Cash and/or Derivatives', 'Cash & Derivatives', null),
  ('country', '*', 'Cash & Others',  'Cash & Derivatives', null);
