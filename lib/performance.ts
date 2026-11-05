// Performance comparison maths (spec 3.4 A). Pure functions, no I/O.
//
// Every line is indexed to 100 on a common start date: the latest first-price date among
// the series shown, or the start of the chosen range if later. Prices are NAVs, which
// already include reinvested income and are net of each fund's TER.

export type PriceSeries = { key: string; dates: string[]; values: number[] }
export type RangeId = "1Y" | "3Y" | "5Y" | "MAX"
export type RangeOption = { id: RangeId; label: string; start: string; available: boolean }
export type ChartRow = { date: string; [seriesKey: string]: string | number | null }

const RANGE_YEARS: Record<Exclude<RangeId, "MAX">, number> = { "1Y": 1, "3Y": 3, "5Y": 5 }

/** ISO date `years` before `iso` (29 Feb falls back to 28 Feb). */
export function yearsBefore(iso: string, years: number): string {
  const [y, m, d] = iso.split("-").map(Number)
  const date = new Date(Date.UTC(y - years, m - 1, d))
  if (date.getUTCMonth() !== m - 1) date.setUTCDate(0)
  return date.toISOString().slice(0, 10)
}

/** First date on which every series has a price. */
export function commonStart(series: PriceSeries[]): string | null {
  const firsts = series.filter((s) => s.dates.length > 0).map((s) => s.dates[0])
  if (firsts.length === 0 || firsts.length !== series.length) return null
  return firsts.reduce((a, b) => (a > b ? a : b))
}

/** Latest date with a price in any series. */
export function latestDate(series: PriceSeries[]): string | null {
  const lasts = series.filter((s) => s.dates.length > 0).map((s) => s.dates[s.dates.length - 1])
  return lasts.length ? lasts.reduce((a, b) => (a > b ? a : b)) : null
}

/** The range buttons. A range is available only if every series has prices for all of it. */
export function rangeOptions(series: PriceSeries[]): RangeOption[] {
  const start = commonStart(series)
  const end = latestDate(series)
  if (!start || !end) return []
  const fixed = (Object.keys(RANGE_YEARS) as Exclude<RangeId, "MAX">[]).map((id) => {
    const rangeStart = yearsBefore(end, RANGE_YEARS[id])
    return { id, label: id, start: rangeStart, available: rangeStart >= start }
  })
  return [...fixed, { id: "MAX" as const, label: "Max", start, available: true }]
}

/** Index of the first date >= target in a sorted ISO-date array, or -1. */
function firstIndexOnOrAfter(dates: string[], target: string): number {
  let lo = 0
  let hi = dates.length - 1
  let ans = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (dates[mid] >= target) {
      ans = mid
      hi = mid - 1
    } else {
      lo = mid + 1
    }
  }
  return ans
}

/** Index each series to 100 at its first price on or after `start`. */
export function normalise(series: PriceSeries[], start: string): PriceSeries[] {
  return series.map((s) => {
    const i = firstIndexOnOrAfter(s.dates, start)
    if (i < 0 || !(s.values[i] > 0)) return { key: s.key, dates: [], values: [] }
    const base = s.values[i]
    return { key: s.key, dates: s.dates.slice(i), values: s.values.slice(i).map((v) => (v / base) * 100) }
  })
}

/** Cumulative return over the series, as a fraction (e.g. 0.25 = +25%). */
export function totalReturn(s: PriceSeries): number | null {
  if (s.values.length < 2) return null
  return s.values[s.values.length - 1] / s.values[0] - 1
}

const DAY_MS = 86_400_000
const weekKey = (iso: string) => Math.floor((Date.parse(iso) / DAY_MS + 3) / 7) // weeks start Monday

/**
 * Merge series into rows for a line chart. Uses the union of price dates; when the period
 * is longer than `weeklyAfterDays`, keeps only the last date of each week (plus the first
 * and last) to keep the chart light. A series carries its last price forward over dates it
 * has none (different holiday calendars), but never past its own last price.
 */
export function chartRows(series: PriceSeries[], weeklyAfterDays = 800): ChartRow[] {
  const all = [...new Set(series.flatMap((s) => s.dates))].sort()
  if (all.length === 0) return []
  const spanDays = (Date.parse(all[all.length - 1]) - Date.parse(all[0])) / DAY_MS
  let dates = all
  if (spanDays > weeklyAfterDays) {
    dates = all.filter((d, i) => i === 0 || i === all.length - 1 || weekKey(d) !== weekKey(all[i + 1]))
  }
  const cursors = series.map(() => -1)
  return dates.map((date) => {
    const row: ChartRow = { date }
    series.forEach((s, k) => {
      while (cursors[k] + 1 < s.dates.length && s.dates[cursors[k] + 1] <= date) cursors[k]++
      const last = s.dates[s.dates.length - 1]
      row[s.key] = cursors[k] >= 0 && date <= last ? s.values[cursors[k]] : null
    })
    return row
  })
}

/** X-axis ticks: the first date of each year for long periods, else of each quarter. */
export function axisTicks(dates: string[], yearly: boolean): string[] {
  const ticks: string[] = []
  let prev = ""
  for (const d of dates) {
    const bucket = yearly ? d.slice(0, 4) : `${d.slice(0, 4)}-Q${Math.floor((Number(d.slice(5, 7)) - 1) / 3)}`
    if (bucket !== prev) {
      if (prev !== "") ticks.push(d) // skip the first (partial) bucket's start, which sits on the axis edge
      prev = bucket
    }
  }
  return ticks
}

/** End labels are only legible when line ends are apart: every gap between neighbouring
 * end values must be at least `minGapShare` of the value range shown. */
export function endLabelsFit(endValues: number[], allValues: number[], minGapShare = 0.07): boolean {
  if (endValues.length === 0 || allValues.length === 0) return false
  const range = Math.max(...allValues) - Math.min(...allValues)
  if (range <= 0) return endValues.length === 1
  const sorted = [...endValues].sort((a, b) => a - b)
  return sorted.every((v, i) => i === 0 || (v - sorted[i - 1]) / range >= minGapShare)
}
