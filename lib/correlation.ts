// Correlation between the selected ETFs (spec 3.4 E). Pure functions, no I/O.
//
// Agreed v1 rule: weekly returns over the common period. Daily NAVs of funds in different
// time zones are struck at different times (Tokyo closes before London opens), which
// understates daily correlation; weekly returns smooth that out.

import type { PriceSeries } from "@/lib/performance"

const DAY_MS = 86_400_000
const weekKey = (iso: string) => Math.floor((Date.parse(iso) / DAY_MS + 3) / 7) // weeks start Monday

/**
 * Weekly prices on a shared calendar: for each week between `start` and the last date every
 * series has a price, the last price date in that week (any series), with each series'
 * latest price on or before it.
 */
export function weeklyPrices(series: PriceSeries[], start: string): { dates: string[]; prices: number[][] } {
  if (series.length === 0 || series.some((s) => s.dates.length === 0)) return { dates: [], prices: [] }
  const end = series.map((s) => s.dates[s.dates.length - 1]).reduce((a, b) => (a < b ? a : b))
  const firstCommon = series.map((s) => s.dates[0]).reduce((a, b) => (a > b ? a : b))
  const from = start > firstCommon ? start : firstCommon
  const all = [...new Set(series.flatMap((s) => s.dates))].filter((d) => d >= from && d <= end).sort()
  const weekEnds = all.filter((d, i) => i === all.length - 1 || weekKey(d) !== weekKey(all[i + 1]))
  const cursors = series.map(() => -1)
  const prices = series.map(() => [] as number[])
  for (const date of weekEnds) {
    series.forEach((s, k) => {
      while (cursors[k] + 1 < s.dates.length && s.dates[cursors[k] + 1] <= date) cursors[k]++
      prices[k].push(s.values[cursors[k]])
    })
  }
  return { dates: weekEnds, prices }
}

export function returns(prices: number[]): number[] {
  const out: number[] = []
  for (let i = 1; i < prices.length; i++) out.push(prices[i] / prices[i - 1] - 1)
  return out
}

/** Pearson correlation of two equal-length samples; null if either has no variation. */
export function pearson(a: number[], b: number[]): number | null {
  const n = Math.min(a.length, b.length)
  if (n < 2) return null
  let ma = 0
  let mb = 0
  for (let i = 0; i < n; i++) {
    ma += a[i]
    mb += b[i]
  }
  ma /= n
  mb /= n
  let cov = 0
  let va = 0
  let vb = 0
  for (let i = 0; i < n; i++) {
    const da = a[i] - ma
    const db = b[i] - mb
    cov += da * db
    va += da * da
    vb += db * db
  }
  if (va === 0 || vb === 0) return null
  return Math.max(-1, Math.min(1, cov / Math.sqrt(va * vb)))
}

export type CorrelationResult = {
  /** matrix[i][j], 1 on the diagonal; null where it can't be computed. */
  matrix: (number | null)[][]
  weeks: number
  from: string | null
  to: string | null
}

/** Minimum weekly returns for a meaningful correlation (about six months). */
export const MIN_WEEKS = 26

export function correlationMatrix(series: PriceSeries[], start: string): CorrelationResult {
  const { dates, prices } = weeklyPrices(series, start)
  const rets = prices.map(returns)
  const weeks = rets[0]?.length ?? 0
  const matrix = series.map((_, i) => series.map((__, j) => (i === j ? 1 : weeks >= MIN_WEEKS ? pearson(rets[i], rets[j]) : null)))
  return { matrix, weeks, from: dates[0] ?? null, to: dates[dates.length - 1] ?? null }
}

/** Plain-English strength used in tooltips and the key. */
export function describeCorrelation(r: number): string {
  const a = Math.abs(r)
  if (a < 0.2) return "little or no relationship"
  const strength = a >= 0.8 ? "very strongly" : a >= 0.6 ? "strongly" : a >= 0.4 ? "moderately" : "weakly"
  return r > 0 ? `tend to move together ${strength}` : `tend to move in opposite directions, ${strength}`
}
