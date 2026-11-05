import "server-only"

import { getCurrentUser } from "@/lib/auth"
import { type AssetClass, displayName, type EtfOption } from "@/lib/etf-types"
import { createClient } from "@/lib/supabase/server"

/** All ETFs available for selection, sorted by name, with their latest TER. */
export async function listEtfs(): Promise<EtfOption[]> {
  await getCurrentUser()
  const supabase = await createClient()
  const [etfs, facts] = await Promise.all([
    supabase.from("etfs").select("isin, name, primary_ticker, asset_class, share_class_currency"),
    supabase.from("latest_fund_facts").select("isin, ter"),
  ])
  if (etfs.error) throw new Error(`Could not load ETFs: ${etfs.error.message}`)
  if (facts.error) throw new Error(`Could not load ETF facts: ${facts.error.message}`)
  const ter = new Map(facts.data.map((f) => [f.isin as string, f.ter === null ? null : Number(f.ter)]))
  return etfs.data
    .map((e) => ({
      isin: e.isin,
      name: displayName(e.name),
    ticker: e.primary_ticker,
    assetClass: e.asset_class as AssetClass | null,
    currency: e.share_class_currency,
      ter: ter.get(e.isin) ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "en-GB", { sensitivity: "base" }))
}
