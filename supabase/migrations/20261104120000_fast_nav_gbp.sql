-- nav_gbp: replace the per-row search through the fx_gbp view (a union with a self-join,
-- which cannot use indexes and hit the statement timeout) with two index lookups on
-- fx_rates (base, quote, date desc) per NAV row.
--
-- For each NAV date: take the latest ECB EUR->GBP rate on or before that date, then the
-- rate for the NAV currency on or before the same ECB date. GBP per X = (EUR->GBP)/(EUR->X).
-- Same columns as before, so the app sees no change. Flagged NAV points stay excluded.

create or replace view public.nav_gbp with (security_invoker = true) as
select n.isin, n.date, n.nav, n.currency,
       g.date as fx_date,
       case n.currency when 'GBP' then 1::numeric
                       when 'EUR' then g.rate
                       else g.rate / x.rate end as gbp_per_unit,
       n.nav * case n.currency when 'GBP' then 1::numeric
                               when 'EUR' then g.rate
                               else g.rate / x.rate end as nav_gbp
from public.nav_prices n
cross join lateral (
  select f.date, f.rate from public.fx_rates f
  where f.base = 'EUR' and f.quote = 'GBP' and f.date <= n.date
  order by f.date desc limit 1
) g
left join lateral (
  select f.rate from public.fx_rates f
  where f.base = 'EUR' and f.quote = n.currency and f.date <= g.date
  order by f.date desc limit 1
) x on n.currency not in ('GBP', 'EUR')
where n.quality = 'ok'
  and (n.currency in ('GBP', 'EUR') or x.rate is not null);
