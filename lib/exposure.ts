// Combined portfolio exposure (spec 3.4 B and C). Pure functions, no I/O.
//
// A fund's published breakdown is weighted by its share of the portfolio. Each fund's
// breakdown is rescaled to sum to exactly 100% first (issuer rounding leaves 99.98–100.04).

import type { AssetClass } from "@/lib/etf-types"

export type ExposureRow = { label: string; iso: string | null; weight: number }

export type FundExposure = {
  isin: string
  assetClass: AssetClass | null
  sectors: ExposureRow[]
  countries: ExposureRow[]
  sectorsAsOf: string | null
  countriesAsOf: string | null
}

export type Contribution = { isin: string; weight: number }
export type CombinedRow = { key: string; label: string; weight: number; contributions: Contribution[] }

/** Agreed v1 rule: these single-country index funds publish no country breakdown, so they
 * count as 100% their home country (the UI says so). */
export const HOME_COUNTRY: Record<string, { iso: string; label: string }> = {
  IE00B5BMR087: { iso: "US", label: "United States" }, // CSPX, S&P 500
  IE00B53SZB19: { iso: "US", label: "United States" }, // CNDX, Nasdaq 100
  IE00B53HP851: { iso: "GB", label: "United Kingdom" }, // CUKX, FTSE 100
  IE00B4L5YX21: { iso: "JP", label: "Japan" }, // IJPA, MSCI Japan IMI
  IE00B539F030: { iso: "GB", label: "United Kingdom" }, // CSUK, MSCI UK
  IE00B3VWLG82: { iso: "GB", label: "United Kingdom" }, // CUKS, MSCI UK Small Cap
  IE00B3WJKG14: { iso: "US", label: "United States" }, // IUIT, S&P 500 Information Technology
  IE00B43HR379: { iso: "US", label: "United States" }, // IUHC, S&P 500 Health Care
  IE00BFM6TC58: { iso: "US", label: "United States" }, // DTLA, US Treasury Bond 20+yr
  IE00BZCQB185: { iso: "IN", label: "India" }, // NDIA, MSCI India
  IE00B5W4TY14: { iso: "KR", label: "South Korea" }, // CSKR, MSCI Korea
  IE00BKY40J65: { iso: "US", label: "United States" }, // HSBC USA Screened Equity
  IE000JZ473P7: { iso: "US", label: "United States" }, // HSBC S&P 500 (Acc)
  IE00BKY53D40: { iso: "GB", label: "United Kingdom" }, // HSBC UK Screened Equity
  IE00BKY55S33: { iso: "JP", label: "Japan" }, // HSBC Japan Screened Equity
  IE0006RFB3X2: { iso: "JP", label: "Japan" }, // HSBC MSCI Japan (Acc)
  IE0007P4PBU1: { iso: "CN", label: "China" }, // HSBC MSCI China (Acc)
  IE00BMWXKN31: { iso: "CN", label: "China" }, // HSBC Hang Seng Tech (Chinese companies listed in Hong Kong)
}

export const ASSET_CLASS_GROUP: Record<AssetClass, string> = {
  equity: "Equity",
  fixed_income: "Bonds",
  property: "Property",
  commodity: "Gold",
  multi_asset: "Multi-asset",
}

const REGION_OF: Record<string, string> = {
  US: "North America", CA: "North America",
  GB: "United Kingdom",
  FR: "Europe ex UK", DE: "Europe ex UK", CH: "Europe ex UK", NL: "Europe ex UK", ES: "Europe ex UK", IT: "Europe ex UK",
  SE: "Europe ex UK", DK: "Europe ex UK", FI: "Europe ex UK", NO: "Europe ex UK", BE: "Europe ex UK", IE: "Europe ex UK",
  AT: "Europe ex UK", PT: "Europe ex UK",
  JP: "Japan",
  AU: "Asia Pacific ex Japan", HK: "Asia Pacific ex Japan", SG: "Asia Pacific ex Japan", NZ: "Asia Pacific ex Japan",
  IL: "Middle East (developed)",
  CN: "Emerging markets", TW: "Emerging markets", IN: "Emerging markets", KR: "Emerging markets", BR: "Emerging markets",
  SA: "Emerging markets", ZA: "Emerging markets", MX: "Emerging markets", ID: "Emerging markets", TH: "Emerging markets",
  MY: "Emerging markets", AE: "Emerging markets", PL: "Emerging markets",
}

const CASH = "Cash & Derivatives"
const OTHER = "Other / not specified"
const GOLD = "Gold (no country)"
const NO_DATA = "No country data"

function rescaled(rows: ExposureRow[]): ExposureRow[] {
  const total = rows.reduce((s, r) => s + r.weight, 0)
  return total > 0 ? rows.map((r) => ({ ...r, weight: (r.weight / total) * 100 })) : []
}

function combine(entries: { isin: string; fraction: number; rows: { key: string; label: string; weight: number }[] }[]): CombinedRow[] {
  const map = new Map<string, CombinedRow>()
  for (const { isin, fraction, rows } of entries) {
    for (const r of rows) {
      const w = fraction * r.weight
      if (w === 0) continue
      const row = map.get(r.key) ?? { key: r.key, label: r.label, weight: 0, contributions: [] }
      row.weight += w
      const c = row.contributions.find((x) => x.isin === isin)
      if (c) c.weight += w
      else row.contributions.push({ isin, weight: w })
      map.set(r.key, row)
    }
  }
  for (const row of map.values()) row.contributions.sort((a, b) => b.weight - a.weight)
  return [...map.values()].sort((a, b) => b.weight - a.weight)
}

/** One fund's country rows in percent, applying the home-country and gold rules. */
function fundCountries(f: FundExposure): { key: string; label: string; weight: number }[] {
  if (f.assetClass === "commodity") return [{ key: GOLD, label: GOLD, weight: 100 }]
  if (f.countries.length === 0) {
    const home = HOME_COUNTRY[f.isin]
    return home ? [{ key: home.iso, label: home.label, weight: 100 }] : [{ key: NO_DATA, label: NO_DATA, weight: 100 }]
  }
  return rescaled(f.countries).map((r) => {
    if (r.iso) return { key: r.iso, label: r.label, weight: r.weight }
    const label = r.label === "Other" ? OTHER : r.label
    return { key: label, label, weight: r.weight }
  })
}

/** Combined country exposure of the whole portfolio, in percent, largest first. */
export function combineCountries(funds: FundExposure[], fractions: number[]): CombinedRow[] {
  return combine(funds.map((f, i) => ({ isin: f.isin, fraction: fractions[i], rows: fundCountries(f) })))
}

/** Combined regional exposure (countries grouped by region). */
export function combineRegions(funds: FundExposure[], fractions: number[]): CombinedRow[] {
  return combine(funds.map((f, i) => ({
    isin: f.isin,
    fraction: fractions[i],
    rows: fundCountries(f).map((r) => {
      const region = REGION_OF[r.key] ?? (r.key === CASH || r.key === GOLD || r.key === NO_DATA ? r.label : r.key === "Supranational" ? "Supranational" : OTHER)
      return { key: region, label: region, weight: r.weight }
    }),
  })))
}

/** Share of the portfolio in each asset class, largest first. */
export function assetClassSplit(funds: FundExposure[], fractions: number[]): CombinedRow[] {
  return combine(funds.map((f, i) => {
    const group = f.assetClass ? ASSET_CLASS_GROUP[f.assetClass] : "Unclassified"
    return { isin: f.isin, fraction: fractions[i], rows: [{ key: group, label: group, weight: 100 }] }
  }))
}

/** Sectors of the equity funds, as percent of the whole portfolio (so they add up to the
 * equity share). Property, bond and gold funds are shown by the asset-class split instead. */
export function combineEquitySectors(funds: FundExposure[], fractions: number[]): CombinedRow[] {
  return combine(funds.flatMap((f, i) => (f.assetClass === "equity"
    ? [{ isin: f.isin, fraction: fractions[i], rows: rescaled(f.sectors).map((r) => ({ key: r.label, label: r.label, weight: r.weight })) }]
    : [])))
}

/** Keep the largest `n` rows and fold the rest into one "All others" row. */
export function topN(rows: CombinedRow[], n: number, otherLabel: string): CombinedRow[] {
  if (rows.length <= n + 1) return rows
  const rest = rows.slice(n)
  const contributions = new Map<string, number>()
  for (const r of rest) for (const c of r.contributions) contributions.set(c.isin, (contributions.get(c.isin) ?? 0) + c.weight)
  return [
    ...rows.slice(0, n),
    {
      key: "__rest__",
      label: `${otherLabel} (${rest.length})`,
      weight: rest.reduce((s, r) => s + r.weight, 0),
      contributions: [...contributions].map(([isin, weight]) => ({ isin, weight })).sort((a, b) => b.weight - a.weight),
    },
  ]
}
