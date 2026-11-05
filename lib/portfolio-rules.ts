// Portfolio rules shared by server and client code (no server-only imports here).

export const CURRENCIES = ["GBP", "EUR", "USD"] as const
export type Currency = (typeof CURRENCIES)[number]
export const MAX_ETFS = 5
export const MAX_NAME_LENGTH = 80

export function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
}
