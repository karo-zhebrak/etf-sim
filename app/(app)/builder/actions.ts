"use server"

import { redirect } from "next/navigation"

import { CURRENCIES, type Currency, isUuid, MAX_AMOUNT, MAX_NAME_LENGTH } from "@/lib/portfolio-rules"
import { createClient } from "@/lib/supabase/server"

export type SaveInput = {
  id: string | null
  name: string
  amount: number | null
  currency: Currency
}

export type SaveResult =
  | { ok: true; id: string; name: string; updatedAt: string }
  | { ok: false; error: string }

/** Create or update a portfolio draft. Drafts may be incomplete (no amount yet). */
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

  // Authorize inside the action; RLS also limits every statement to the user's own rows.
  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  if (!claims?.claims) redirect("/login")

  const row = { name, amount: amount === null ? null : Math.round(amount * 100) / 100, currency: input.currency }
  const query = input.id === null
    ? supabase.from("portfolios").insert(row).select("id, name, updated_at").single()
    : supabase.from("portfolios").update(row).eq("id", input.id).select("id, name, updated_at").maybeSingle()
  const { data, error } = await query
  if (error) return { ok: false, error: "We couldn't save the portfolio. Please try again." }
  if (!data) return { ok: false, error: "That portfolio doesn't exist any more. It may have been deleted." }
  return { ok: true, id: data.id, name: data.name, updatedAt: data.updated_at }
}
