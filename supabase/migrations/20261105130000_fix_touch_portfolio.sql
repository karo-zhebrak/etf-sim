-- Fix: deleting a user from Supabase Auth failed (500). The auth service deletes users as
-- its own restricted role; the cascade then deleted portfolio_etfs rows, whose trigger tried
-- to update public.portfolios with the auth role's privileges, which it lacks.
--
-- * security definer: the trigger only ever sets updated_at on the parent portfolio, so it
--   is safe to run with the owner's privileges.
-- * Skip cascaded deletes (trigger depth > 1): the parent portfolio is being deleted anyway.

create or replace function public.touch_portfolio()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'portfolios' then
    new.updated_at := now();
    return new;
  end if;
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return null;
  end if;
  update public.portfolios set updated_at = now()
  where id = coalesce(new.portfolio_id, old.portfolio_id);
  return null;
end;
$$;

revoke execute on function public.touch_portfolio() from public, anon, authenticated;
