// Portfolio allocation rules (spec 3.5). Weights are percentages.
// A selection whose weights are all null is equally weighted ("not customised").

export type WeightedEtf = { isin: string; weight: number | null }

export const isCustomised = (etfs: WeightedEtf[]) => etfs.some((e) => e.weight !== null)

/** Equal weights rounded to 2 decimals that add up to exactly 100 (the first fund
 * absorbs the rounding, e.g. 3 funds → 33.34, 33.33, 33.33). */
export function equalWeights(n: number): number[] {
  if (n === 0) return []
  const base = Math.floor((10000 / n)) / 100
  const weights = Array.from({ length: n }, () => base)
  weights[0] = Math.round((100 - base * (n - 1)) * 100) / 100
  return weights
}

/** The weights to show and use: explicit when customised, otherwise equal. */
export function effectiveWeights(etfs: WeightedEtf[]): number[] {
  if (!isCustomised(etfs)) return equalWeights(etfs.length)
  return etfs.map((e) => e.weight ?? 0)
}

export const totalWeight = (weights: number[]) => Math.round(weights.reduce((s, w) => s + w, 0) * 100) / 100

/** Weights must add up to 100% (to the nearest 0.01) and each be above zero. */
export function allocationError(etfs: WeightedEtf[]): string | null {
  if (etfs.length === 0) return null
  const weights = effectiveWeights(etfs)
  if (weights.some((w) => w <= 0)) return "Every selected ETF needs an allocation above 0%. Remove a fund instead of setting it to 0%."
  const total = totalWeight(weights)
  if (total !== 100) return `Allocations must add up to 100%. They currently add up to ${total}%.`
  return null
}

/** Parse a typed percentage ("25", "33.5", "12.25%"). Null if empty, NaN if invalid. */
export function parseWeight(raw: string): number | null {
  const s = raw.replace(/[%\s]/g, "")
  if (s === "") return null
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(s)) return Number.NaN
  const v = Number(s)
  return v > 100 ? Number.NaN : v
}

/** Weights as exact fractions for calculations: equal shares are exactly 1/n (not the
 * rounded display values). */
export function exactFractions(etfs: WeightedEtf[]): number[] {
  if (!isCustomised(etfs)) return etfs.map(() => 1 / etfs.length)
  return etfs.map((e) => (e.weight ?? 0) / 100)
}
