-- Price series for portfolio analysis, converted into the portfolio currency.
--
-- Returns one row per series with date and value arrays (arrays avoid the API's per-request
-- row limit; a fund can have 4,000+ days):
--   * each requested ISIN: daily NAV (already net of TER and, being accumulating, total
--     return), flagged points excluded;
--   * 'MSCI_WORLD': MSCI World Index (Net) as published in iShares SWDA's fund data file
--     (USD), starting after its last flagged point (the issuer's rebasing glitch).
-- FX: ECB euro reference rates. X -> T = (EUR->T) / (EUR->X), using the latest ECB date on
-- or before each price date (carries rates over weekends and holidays).
-- security invoker: the caller's RLS applies (signed-in users only).

create function public.price_series(p_isins text[], p_currency text)
returns table (series text, dates date[], vals numeric[])
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_currency not in ('GBP', 'EUR', 'USD') then
    raise exception 'Unsupported currency %', p_currency using errcode = 'invalid_parameter_value';
  end if;
  if coalesce(array_length(p_isins, 1), 0) > 5 then
    raise exception 'At most 5 ETFs' using errcode = 'invalid_parameter_value';
  end if;

  return query
  with src as (
    select n.isin as series, n.date, n.nav as value, n.currency
    from public.nav_prices n
    where n.isin = any (p_isins) and n.quality = 'ok'
    union all
    select 'MSCI_WORLD', t.date, t.value, 'USD'
    from public.total_return_index t
    where t.isin = 'IE00B4L5Y983' and t.series = 'benchmark' and t.quality = 'ok'
      and t.date > coalesce((
        select max(f.date) from public.total_return_index f
        where f.isin = 'IE00B4L5Y983' and f.series = 'benchmark' and f.quality = 'flagged'
      ), '-infinity'::date)
  ),
  conv as (
    select s.series, s.date,
      case
        when s.currency = p_currency then s.value
        else s.value
          * (case when p_currency = 'EUR' then 1 else tq.rate end)
          / (case when s.currency = 'EUR' then 1 else fq.rate end)
      end as value
    from src s
    left join lateral (
      select f.rate from public.fx_rates f
      where f.base = 'EUR' and f.quote = p_currency and f.date <= s.date
      order by f.date desc limit 1
    ) tq on s.currency <> p_currency and p_currency <> 'EUR'
    left join lateral (
      select f.rate from public.fx_rates f
      where f.base = 'EUR' and f.quote = s.currency and f.date <= s.date
      order by f.date desc limit 1
    ) fq on s.currency <> p_currency and s.currency <> 'EUR'
  )
  select c.series, array_agg(c.date order by c.date), array_agg(round(c.value, 6) order by c.date)
  from conv c
  where c.value is not null
  group by c.series;
end;
$$;

revoke execute on function public.price_series(text[], text) from public, anon;
grant execute on function public.price_series(text[], text) to authenticated;
