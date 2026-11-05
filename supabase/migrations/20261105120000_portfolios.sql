-- Saved portfolios (v1 spec sections 3.6 and 3.7). Each portfolio belongs to one user and
-- is visible only to them. Drafts may be incomplete: no amount yet, or no ETFs yet.

create table public.portfolios (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null check (char_length(btrim(name)) between 1 and 80),
  amount     numeric check (amount > 0 and amount <= 100000000),   -- null until the user enters one
  currency   text not null default 'GBP' check (currency in ('GBP', 'EUR', 'USD')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()                    -- "last modified"
);

create index portfolios_user_updated_idx on public.portfolios (user_id, updated_at desc);

-- Selected ETFs, in the order the user added them, with their allocation.
create table public.portfolio_etfs (
  portfolio_id uuid not null references public.portfolios (id) on delete cascade,
  isin         text not null references public.etfs (isin),
  position     smallint not null check (position between 1 and 5),
  weight       numeric check (weight >= 0 and weight <= 100),     -- percent; null = equal weights not yet customised
  primary key (portfolio_id, isin),
  unique (portfolio_id, position)                                  -- also caps a portfolio at 5 ETFs
);

create index portfolio_etfs_isin_idx on public.portfolio_etfs (isin);

-- Keep "last modified" current when the portfolio or its ETF list changes.
create function public.touch_portfolio()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_table_name = 'portfolios' then
    new.updated_at := now();
    return new;
  end if;
  update public.portfolios set updated_at = now()
  where id = coalesce(new.portfolio_id, old.portfolio_id);
  return null;
end;
$$;

create trigger portfolios_touch before update on public.portfolios
  for each row execute function public.touch_portfolio();
create trigger portfolio_etfs_touch after insert or update or delete on public.portfolio_etfs
  for each row execute function public.touch_portfolio();

-- Row level security: owners only.
alter table public.portfolios     enable row level security;
alter table public.portfolio_etfs enable row level security;

create policy "owner select" on public.portfolios for select to authenticated
  using (user_id = (select auth.uid()));
create policy "owner insert" on public.portfolios for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "owner update" on public.portfolios for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner delete" on public.portfolios for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "owner all" on public.portfolio_etfs for all to authenticated
  using (exists (select 1 from public.portfolios p where p.id = portfolio_id and p.user_id = (select auth.uid())))
  with check (exists (select 1 from public.portfolios p where p.id = portfolio_id and p.user_id = (select auth.uid())));
