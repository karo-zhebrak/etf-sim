// ETF shapes shared by server and client code.

export type AssetClass = "equity" | "fixed_income" | "commodity" | "property" | "multi_asset"

/** One row in the ETF selection list. */
export type EtfOption = {
  isin: string
  name: string
  ticker: string | null
  assetClass: AssetClass | null
  currency: string | null
  ter: number | null
}

export const ASSET_CLASS_LABELS: Record<AssetClass, string> = {
  equity: "Equity",
  fixed_income: "Bonds",
  commodity: "Commodity",
  property: "Property",
  multi_asset: "Multi-asset",
}

const KEEP_UPPER = new Set([
  "HSBC", "ETF", "ETC", "UCITS", "ESG", "MSCI", "FTSE", "EPRA", "NAREIT", "USA", "UK", "US", "EM", "IMI",
  "ACWI", "S&P", "GBP", "USD", "EUR", "SRI", "REIT", "REITS", "EMU", "EURO", "STOXX",
  // Company names usually written in capitals (holdings lists).
  "NVIDIA", "ASML", "SAP", "BP", "BAE", "SK", "AMD", "IBM", "HDFC", "ICICI", "ABB", "UBS", "ING", "AXA", "BNP",
  "LVMH", "GSK", "RELX", "KLA", "TSMC", "BHP", "AIA", "DBS", "NXP", "CSL", "RWE", "BBVA", "ANZ", "NAB", "JD",
])
const NAME_CASE: Record<string, string> = { NASDAQ: "Nasdaq", EX: "ex" }

/** Names printed in capitals (HSBC fund names, iShares holdings) shown in title case,
 * keeping acronyms ("HSBC MSCI World UCITS ETF", "Amazon.com Inc", "NVIDIA"). Only the first
 * letter of each space-separated word is capitalised. Mixed-case names are kept. */
export function displayName(name: string): string {
  // HSBC sometimes prints "ex" in lower case inside an all-caps name ("MSCI PACIFIC ex JAPAN").
  const probe = name.replace(/\bex\b/g, "EX")
  if (probe !== probe.toUpperCase()) return name
  return name
    .split(" ")
    .map((w) => {
      if (KEEP_UPPER.has(w) || /\d/.test(w)) return w
      if (NAME_CASE[w]) return NAME_CASE[w]
      return w.charAt(0) + w.slice(1).toLowerCase()
    })
    .join(" ")
}

/** Case-insensitive match on name, ISIN or ticker. Every word typed must match. */
export function matchesQuery(etf: EtfOption, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const haystack = `${etf.name} ${etf.isin} ${etf.ticker ?? ""}`.toLowerCase()
  return words.every((w) => haystack.includes(w))
}

export type Distribution = "acc" | "none"
export type Replication = "physical" | "physical_sampled" | "synthetic"

export type EtfHolding = { name: string; isin: string | null; weight: number }

/** Everything the ETF detail view shows (spec 3.3 B). */
export type EtfDetail = {
  isin: string
  name: string
  ticker: string | null
  benchmark: string | null
  description: string | null
  distribution: Distribution | null
  replication: Replication | null
  currency: string | null
  inceptionDate: string | null
  ter: number | null
  assetClass: AssetClass | null
  factsheetUrl: string | null
  topHoldings: EtfHolding[]
  holdingsAsOf: string | null
}

export const DISTRIBUTION_LABELS: Record<Distribution, string> = {
  acc: "Accumulating (income is reinvested)",
  none: "No income (physical gold)",
}

export const REPLICATION_LABELS: Record<Replication, string> = {
  physical: "Physical (full replication)",
  physical_sampled: "Physical (sampled)",
  synthetic: "Synthetic (swap-based)",
}
