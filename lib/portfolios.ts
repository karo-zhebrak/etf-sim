import "server-only"

import { getCurrentUser } from "@/lib/auth"
import { type Currency, isUuid } from "@/lib/portfolio-rules"
import { createClient } from "@/lib/supabase/server"

export type PortfolioSummary = {
  id: string
  name: string
  amount: number | null
  currency: Currency
  etfCount: number
  updatedAt: string
}

type Row = {
  id: string
  name: string
  amount: number | null
  currency: Currency
  updated_at: string
  portfolio_etfs: { count: number }[]
}

const toSummary = (r: Row): PortfolioSummary => ({
  id: r.id,
  name: r.name,
  amount: r.amount === null ? null : Number(r.amount),
  currency: r.currency,
  etfCount: r.portfolio_etfs[0]?.count ?? 0,
  updatedAt: r.updated_at,
})

const SUMMARY_COLUMNS = "id, name, amount, currency, updated_at, portfolio_etfs(count)"

/** The signed-in user's portfolios, most recently modified first. RLS limits rows to the owner. */
export async function listPortfolios(): Promise<PortfolioSummary[]> {
  await getCurrentUser()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("portfolios")
    .select(SUMMARY_COLUMNS)
    .order("updated_at", { ascending: false })
  if (error) throw new Error(`Could not load portfolios: ${error.message}`)
  return (data as unknown as Row[]).map(toSummary)
}

/** One of the user's portfolios, or null if it doesn't exist or belongs to someone else. */
export async function getPortfolio(id: string): Promise<PortfolioSummary | null> {
  await getCurrentUser()
  if (!isUuid(id)) return null
  const supabase = await createClient()
  const { data, error } = await supabase.from("portfolios").select(SUMMARY_COLUMNS).eq("id", id).maybeSingle()
  if (error) throw new Error(`Could not load portfolio: ${error.message}`)
  return data ? toSummary(data as unknown as Row) : null
}
