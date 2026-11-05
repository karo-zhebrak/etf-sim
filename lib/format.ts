// UK-first display formatting shared by server and client components.

const moneyFormatters = new Map<string, Intl.NumberFormat>()

/** "£10,000" / "€2,500.50": whole amounts drop the pence. */
export function formatMoney(amount: number, currency: string): string {
  const whole = Number.isInteger(amount)
  const key = `${currency}:${whole}`
  let f = moneyFormatters.get(key)
  if (!f) {
    f = new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency,
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: whole ? 0 : 2,
    })
    moneyFormatters.set(key, f)
  }
  return f.format(amount)
}

const dateTimeFmt = new Intl.DateTimeFormat("en-GB", {
  day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London",
})

/** "5 Nov 2026, 14:03" in UK time. */
export function formatDateTime(iso: string): string {
  return dateTimeFmt.format(new Date(iso))
}
