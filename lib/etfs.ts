import "server-only"

import { getCurrentUser } from "@/lib/auth"
import {
  type AssetClass, displayName, type Distribution, type EtfDetail, type EtfOption, type Replication,
} from "@/lib/etf-types"
import type { FundExposure } from "@/lib/exposure"
import { isRealHolding } from "@/lib/holdings-rules"
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

const ISIN_RE = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/

/** Detail view data for one ETF, with its 10 largest real holdings (cash, FX hedges and
 * futures lines excluded). Expects the caller to have authorized the request. */
export async function getEtfDetail(isin: string): Promise<EtfDetail | null> {
  if (!ISIN_RE.test(isin)) return null
  const supabase = await createClient()
  const [etf, facts, holdings] = await Promise.all([
    supabase.from("etfs")
      .select("isin, name, primary_ticker, benchmark_index, description, distribution, replication, share_class_currency, inception_date, asset_class, factsheet_url")
      .eq("isin", isin).maybeSingle(),
    supabase.from("latest_fund_facts").select("ter").eq("isin", isin).maybeSingle(),
    // Over-fetch so that excluded lines still leave ten real holdings.
    supabase.from("latest_holdings").select("name, security_isin, asset_class, weight, as_of")
      .eq("isin", isin).not("weight", "is", null).order("weight", { ascending: false }).limit(40),
  ])
  if (etf.error || facts.error || holdings.error) {
    throw new Error(`Could not load ETF details: ${(etf.error ?? facts.error ?? holdings.error)!.message}`)
  }
  if (!etf.data) return null
  const e = etf.data
  const real = holdings.data.filter((h) => isRealHolding(h)).slice(0, 10)
  return {
    isin: e.isin,
    name: displayName(e.name),
    ticker: e.primary_ticker,
    benchmark: e.benchmark_index,
    description: e.description,
    distribution: e.distribution as Distribution | null,
    replication: e.replication as Replication | null,
    currency: e.share_class_currency,
    inceptionDate: e.inception_date,
    ter: facts.data?.ter === null || facts.data?.ter === undefined ? null : Number(facts.data.ter),
    assetClass: e.asset_class as AssetClass | null,
    factsheetUrl: e.factsheet_url,
    topHoldings: real.map((h) => ({ name: h.name, isin: h.security_isin, weight: Number(h.weight) })),
    holdingsAsOf: holdings.data[0]?.as_of ?? null,
  }
}

/** Latest sector and country breakdowns for the given ETFs (portfolio exposure analysis).
 * Expects the caller to have authorized the request. */
export async function getExposures(isins: string[]): Promise<FundExposure[]> {
  const list = isins.filter((i) => ISIN_RE.test(i))
  if (list.length === 0) return []
  const supabase = await createClient()
  const [etfs, rows] = await Promise.all([
    supabase.from("etfs").select("isin, asset_class").in("isin", list),
    supabase.from("latest_exposures").select("isin, kind, label, label_normalised, iso_code, weight, as_of")
      .in("isin", list).in("kind", ["sector", "country"]),
  ])
  if (etfs.error || rows.error) throw new Error(`Could not load exposures: ${(etfs.error ?? rows.error)!.message}`)
  const assetClass = new Map(etfs.data.map((e) => [e.isin, e.asset_class as AssetClass | null]))
  return list.map((isin) => {
    const mine = rows.data.filter((r) => r.isin === isin)
    const pick = (kind: string) => mine.filter((r) => r.kind === kind)
    const toRows = (kind: string) => pick(kind).map((r) => ({
      label: r.label_normalised ?? r.label, iso: r.iso_code, weight: Number(r.weight),
    }))
    return {
      isin,
      assetClass: assetClass.get(isin) ?? null,
      sectors: toRows("sector"),
      countries: toRows("country"),
      sectorsAsOf: pick("sector")[0]?.as_of ?? null,
      countriesAsOf: pick("country")[0]?.as_of ?? null,
    }
  })
}
