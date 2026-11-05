"use server"

import { redirect } from "next/navigation"

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
  | { ok: false; error: string }

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

  // Authorize inside the action; RLS also limits every statement to the user's own rows.
  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  if (!claims?.claims) redirect("/login")

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
