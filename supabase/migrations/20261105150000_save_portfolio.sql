-- Save a portfolio and its ETF selection in one transaction.
-- security invoker: runs as the caller, so RLS limits it to the caller's own portfolios.
-- p_id null creates a new portfolio; otherwise updates it (error if not found / not owned).
-- p_etfs: JSON array of {"isin": text, "weight": number|null} in display order (max 5).

create function public.save_portfolio(
  p_id uuid,
  p_name text,
  p_amount numeric,
  p_currency text,
  p_etfs jsonb
)
returns table (id uuid, name text, updated_at timestamptz)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_count int := coalesce(jsonb_array_length(p_etfs), 0);
begin
  if v_count > 5 then
    raise exception 'A portfolio can hold at most 5 ETFs' using errcode = 'check_violation';
  end if;

  if p_id is null then
    insert into public.portfolios (name, amount, currency)
    values (p_name, p_amount, p_currency)
    returning portfolios.id into v_id;
  else
    update public.portfolios p
    set name = p_name, amount = p_amount, currency = p_currency
    where p.id = p_id
    returning p.id into v_id;
    if v_id is null then
      raise exception 'Portfolio not found' using errcode = 'no_data_found';
    end if;
  end if;

  -- Replace the ETF selection (positions are renumbered 1..n in the given order).
  delete from public.portfolio_etfs e where e.portfolio_id = v_id;
  insert into public.portfolio_etfs (portfolio_id, isin, position, weight)
  select v_id, x.elem ->> 'isin', x.ord::smallint, (x.elem ->> 'weight')::numeric
  from jsonb_array_elements(coalesce(p_etfs, '[]'::jsonb)) with ordinality as x(elem, ord);

  return query select p.id, p.name, p.updated_at from public.portfolios p where p.id = v_id;
end;
$$;

revoke execute on function public.save_portfolio(uuid, text, numeric, text, jsonb) from public, anon;
grant execute on function public.save_portfolio(uuid, text, numeric, text, jsonb) to authenticated;
