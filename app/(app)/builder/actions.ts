"use server"

import type { EtfDetail } from "@/lib/etf-types"
import type { FundHoldings } from "@/lib/constituents"
import type { FundExposure } from "@/lib/exposure"
import { getEtfDetail, getExposures, getTopHoldings } from "@/lib/etfs"
import {
  CURRENCIES, type Currency, isUuid, MAX_AMOUNT, MAX_ETFS, MAX_NAME_LENGTH,
} from "@/lib/portfolio-rules"
import { createClient } from "@/lib/supabase/server"

export type SaveInput = {
  id: string | null
  name: string
  amount: number | null
  currency: Currency
  /** Selected ETFs in display order. weight is null until allocations are customised. */
  etfs: { isin: string; weight: number | null }[]
}

export type SaveResult =
  | { ok: true; id: string; name: string; updatedAt: string }
  | { ok: false; error: string; needsSignIn?: boolean }

const ISIN_RE = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/

/** Create or update a portfolio draft and its ETF selection, atomically (save_portfolio
 * runs in one transaction). Drafts may be incomplete: no amount, no ETFs. */
export async function savePortfolio(input: SaveInput): Promise<SaveResult> {
  const name = String(input.name ?? "").trim().replace(/\s+/g, " ")
  if (!name) return { ok: false, error: "Give your portfolio a name." }
  if (name.length > MAX_NAME_LENGTH) return { ok: false, error: `Use ${MAX_NAME_LENGTH} characters or fewer for the name.` }
  if (!CURRENCIES.includes(input.currency)) return { ok: false, error: "Choose GBP, EUR or USD." }
  const amount = input.amount
  if (amount !== null && !(Number.isFinite(amount) && amount > 0 && amount <= MAX_AMOUNT)) {
    return { ok: false, error: "Enter an investment amount greater than zero." }
  }
  if (input.id !== null && !isUuid(input.id)) return { ok: false, error: "That portfolio doesn't exist." }
  const etfs = Array.isArray(input.etfs) ? input.etfs : []
  if (etfs.length > MAX_ETFS) return { ok: false, error: `Choose at most ${MAX_ETFS} ETFs.` }
  const isins = etfs.map((e) => e.isin)
  if (isins.some((i) => !ISIN_RE.test(i)) || new Set(isins).size !== isins.length) {
    return { ok: false, error: "The ETF selection isn't valid. Please reselect your ETFs." }
  }

  // Saving needs an account (the builder itself works signed out). Authorize inside the
  // action; RLS also limits every statement to the user's own rows.
  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  if (!claims?.claims) return { ok: false, error: "Sign in to save your portfolio.", needsSignIn: true }

  const { data, error } = await supabase
    .rpc("save_portfolio", {
      p_id: input.id,
      p_name: name,
      p_amount: amount === null ? null : Math.round(amount * 100) / 100,
      p_currency: input.currency,
      p_etfs: etfs.map((e) => ({ isin: e.isin, weight: e.weight })),
    })
    .single<{ id: string; name: string; updated_at: string }>()
  if (error) {
    if (error.code === "P0002") return { ok: false, error: "That portfolio doesn't exist any more. It may have been deleted." }
    if (error.code === "23503") return { ok: false, error: "One of the selected ETFs is no longer available. Please reselect." }
    return { ok: false, error: "We couldn't save the portfolio. Please try again." }
  }
  return { ok: true, id: data.id, name: data.name, updatedAt: data.updated_at }
}

/** Details for the ETF detail view, loaded when the user opens it. */
export async function loadEtfDetail(isin: string): Promise<EtfDetail | null> {
  return getEtfDetail(String(isin))
}

export type SeriesPayload = { key: string; dates: string[]; values: number[] }

/** Price series for the analysis, converted into the portfolio currency: one per ISIN plus
 * MSCI_WORLD. NAVs are total return and already net of each fund's TER. */
export async function loadPriceSeries(isins: string[], currency: Currency): Promise<SeriesPayload[] | null> {
  const list = Array.isArray(isins) ? isins.filter((i) => ISIN_RE.test(i)) : []
  if (list.length === 0 || list.length > MAX_ETFS || !CURRENCIES.includes(currency)) return null
  // Market data: readable without an account (RLS allows anon reads, never writes).
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("price_series", { p_isins: list, p_currency: currency })
  if (error || !data) return null
  return (data as { series: string; dates: string[]; vals: (number | string)[] }[]).map((r) => ({
    key: r.series,
    dates: r.dates,
    values: r.vals.map(Number),
  }))
}

/** Sector and country breakdowns of the selected ETFs, for the exposure charts. */
export async function loadExposures(isins: string[]): Promise<FundExposure[] | null> {
  const list = Array.isArray(isins) ? isins.filter((i) => ISIN_RE.test(i)).slice(0, MAX_ETFS) : []
  if (list.length === 0) return null
  try {
    return await getExposures(list)
  } catch {
    return null
  }
}

/** Each selected ETF's largest holdings, for the combined top constituents. */
export async function loadTopHoldings(isins: string[]): Promise<FundHoldings[] | null> {
  const list = Array.isArray(isins) ? isins.filter((i) => ISIN_RE.test(i)).slice(0, MAX_ETFS) : []
  if (list.length === 0) return null
  try {
    return await getTopHoldings(list)
  } catch {
    return null
  }
}
