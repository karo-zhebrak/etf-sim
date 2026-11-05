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

export type PortfolioEtf = { isin: string; weight: number | null }

export type Portfolio = Omit<PortfolioSummary, "etfCount"> & {
  /** In display order (position 1..5). */
  etfs: PortfolioEtf[]
}

type SummaryRow = {
  id: string
  name: string
  amount: number | null
  currency: Currency
  updated_at: string
  portfolio_etfs: { count: number }[]
}

/** The signed-in user's portfolios, most recently modified first. RLS limits rows to the owner. */
export async function listPortfolios(): Promise<PortfolioSummary[]> {
  await getCurrentUser()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("portfolios")
    .select("id, name, amount, currency, updated_at, portfolio_etfs(count)")
    .order("updated_at", { ascending: false })
  if (error) throw new Error(`Could not load portfolios: ${error.message}`)
  return (data as unknown as SummaryRow[]).map((r) => ({
    id: r.id,
    name: r.name,
    amount: r.amount === null ? null : Number(r.amount),
    currency: r.currency,
    etfCount: r.portfolio_etfs[0]?.count ?? 0,
    updatedAt: r.updated_at,
  }))
}

type PortfolioRow = Omit<SummaryRow, "portfolio_etfs"> & {
  portfolio_etfs: { isin: string; position: number; weight: number | null }[]
}

/** One of the user's portfolios with its ETFs, or null if missing or someone else's. */
export async function getPortfolio(id: string): Promise<Portfolio | null> {
  await getCurrentUser()
  if (!isUuid(id)) return null
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("portfolios")
    .select("id, name, amount, currency, updated_at, portfolio_etfs(isin, position, weight)")
    .eq("id", id)
    .maybeSingle()
  if (error) throw new Error(`Could not load portfolio: ${error.message}`)
  if (!data) return null
  const r = data as unknown as PortfolioRow
  return {
    id: r.id,
    name: r.name,
    amount: r.amount === null ? null : Number(r.amount),
    currency: r.currency,
    updatedAt: r.updated_at,
    etfs: [...r.portfolio_etfs]
      .sort((a, b) => a.position - b.position)
      .map((e) => ({ isin: e.isin, weight: e.weight === null ? null : Number(e.weight) })),
  }
}
