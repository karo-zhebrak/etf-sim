// Which issuer holdings lines are real investments. Shared by the ETF detail view and the
// portfolio constituents analysis.

/** iShares tags non-investment lines with these asset classes. */
const NON_SECURITY_ASSET_CLASSES = new Set(["cash", "fx", "futures", "cash collateral and margins", "money market"])

/** HSBC's holdings file has no asset class, so currency hedges and cash are found by name. */
const NON_SECURITY_NAME = /\b(fwd fx|fx contract|forward|currency contract|cash|margin|collateral|receivable|payable)\b/i

export function isRealHolding(h: { name: string; asset_class?: string | null }): boolean {
  if (h.asset_class && NON_SECURITY_ASSET_CLASSES.has(h.asset_class.toLowerCase())) return false
  return !NON_SECURITY_NAME.test(h.name)
}
