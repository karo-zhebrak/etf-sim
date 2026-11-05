// Portfolio rules shared by server and client code (no server-only imports here).

export const CURRENCIES = ["GBP", "EUR", "USD"] as const
export type Currency = (typeof CURRENCIES)[number]
export const MAX_ETFS = 5
export const MAX_NAME_LENGTH = 80
/** Matches the database check on portfolios.amount. */
export const MAX_AMOUNT = 100_000_000

export const CURRENCY_LABELS: Record<Currency, string> = {
  GBP: "British pound (£)",
  EUR: "Euro (€)",
  USD: "US dollar ($)",
}

/** Parse a typed amount such as "10,000" or "£2,500.50". Returns null if empty, NaN if invalid. */
export function parseAmount(raw: string): number | null {
  const s = raw.replace(/[£€$,\s]/g, "")
  if (s === "") return null
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return Number.NaN
  return Number(s)
}

export function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
}
