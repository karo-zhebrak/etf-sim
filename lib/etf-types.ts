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
  "ACWI", "S&P", "GBP", "USD", "EUR", "SRI", "REIT", "REITS", "EMU",
])
const NAME_CASE: Record<string, string> = { NASDAQ: "Nasdaq", EX: "ex" }

/** HSBC factsheets print fund names in capitals ("HSBC MSCI WORLD UCITS ETF"). Show those
 * in title case, keeping acronyms ("HSBC MSCI World UCITS ETF"). Mixed-case names are kept. */
export function displayName(name: string): string {
  if (name !== name.toUpperCase()) return name
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
