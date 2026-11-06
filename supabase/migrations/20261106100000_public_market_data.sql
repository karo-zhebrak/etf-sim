-- The app can be used without an account (decided 2026-11-06): visitors build and analyse
-- portfolios; signing in is needed only to save them.
--
-- Market data becomes readable by `anon` as well as `authenticated`. Still read-only:
-- there are no insert/update/delete policies, so only the service role (the pipeline) writes.
-- Portfolios stay owner-only (their policies require auth.uid(), which is null for anon).
-- Bookkeeping tables (pipeline_runs, source_files, data_flags) stay unreadable from the app.

create policy "anon read" on public.etfs                for select to anon using (true);
create policy "anon read" on public.listings            for select to anon using (true);
create policy "anon read" on public.fund_fact_snapshots for select to anon using (true);
create policy "anon read" on public.performance_returns for select to anon using (true);
create policy "anon read" on public.exposures           for select to anon using (true);
create policy "anon read" on public.holdings            for select to anon using (true);
create policy "anon read" on public.nav_prices          for select to anon using (true);
create policy "anon read" on public.total_return_index  for select to anon using (true);
create policy "anon read" on public.fx_rates            for select to anon using (true);
create policy "anon read" on public.label_mappings      for select to anon using (true);

grant execute on function public.price_series(text[], text) to anon;
