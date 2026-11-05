import { describe, expect, it } from "vitest"

import {
  assetClassSplit, combineCountries, combineEquitySectors, combineRegions, type FundExposure, topN,
} from "./exposure"

const fund = (isin: string, assetClass: FundExposure["assetClass"], countries: [string, string | null, number][], sectors: [string, number][] = []): FundExposure => ({
  isin, assetClass,
  countries: countries.map(([label, iso, weight]) => ({ label, iso, weight })),
  sectors: sectors.map(([label, weight]) => ({ label, iso: null, weight })),
  countriesAsOf: "2026-10-30", sectorsAsOf: "2026-10-30",
})

const WORLD = fund("WORLD", "equity", [["United States", "US", 70], ["Japan", "JP", 20], ["Other", null, 10]], [["Information Technology", 60], ["Financials", 40]])
const CSPX = fund("IE00B5BMR087", "equity", [], [["Information Technology", 50], ["Health Care", 50]])
const GOLD = fund("GOLD", "commodity", [])
const BOND = fund("BOND", "fixed_income", [["Germany", "DE", 50], ["Supranational", null, 50]], [["Government", 100]])

describe("combineCountries", () => {
  it("weights each fund's countries by its portfolio share and tracks contributions", () => {
    const rows = combineCountries([WORLD, CSPX], [0.5, 0.5])
    expect(rows.map((r) => [r.key, r.weight])).toEqual([["US", 85], ["JP", 10], ["Other / not specified", 5]])
    expect(rows[0].contributions).toEqual([{ isin: "IE00B5BMR087", weight: 50 }, { isin: "WORLD", weight: 35 }])
  })

  it("applies the home-country rule and the gold slice", () => {
    const rows = combineCountries([CSPX, GOLD], [0.75, 0.25])
    expect(rows.map((r) => [r.label, r.weight])).toEqual([["United States", 75], ["Gold (no country)", 25]])
  })

  it("rescales a fund's breakdown that doesn't sum to exactly 100", () => {
    const f = fund("F", "equity", [["United States", "US", 59.99], ["Japan", "JP", 40]])
    const total = combineCountries([f], [1]).reduce((s, r) => s + r.weight, 0)
    expect(total).toBeCloseTo(100, 10)
  })

  it("adds up to 100% for any mix", () => {
    const total = combineCountries([WORLD, CSPX, GOLD, BOND], [0.4, 0.3, 0.2, 0.1]).reduce((s, r) => s + r.weight, 0)
    expect(total).toBeCloseTo(100, 10)
  })
})

describe("regions, asset classes and sectors", () => {
  it("groups countries into regions", () => {
    const rows = combineRegions([WORLD, BOND], [0.5, 0.5])
    expect(Object.fromEntries(rows.map((r) => [r.key, r.weight]))).toEqual({
      "North America": 35, Japan: 10, "Other / not specified": 5, "Europe ex UK": 25, Supranational: 25,
    })
  })

  it("splits by asset class", () => {
    expect(assetClassSplit([WORLD, GOLD, BOND], [0.6, 0.3, 0.1]).map((r) => [r.key, r.weight]))
      .toEqual([["Equity", 60], ["Gold", 30], ["Bonds", 10]])
  })

  it("combines equity sectors only, as a share of the whole portfolio", () => {
    const rows = combineEquitySectors([WORLD, CSPX, BOND], [0.4, 0.4, 0.2])
    expect(rows.map((r) => [r.key, Math.round(r.weight * 100) / 100])).toEqual([
      ["Information Technology", 44], ["Health Care", 20], ["Financials", 16],
    ])
    expect(rows.reduce((s, r) => s + r.weight, 0)).toBeCloseTo(80)
  })

  it("folds the tail into one row with merged contributions", () => {
    const rows = combineCountries([WORLD, BOND], [0.5, 0.5])
    const folded = topN(rows, 2, "All other countries")
    expect(folded).toHaveLength(3)
    expect(folded[2].label).toBe("All other countries (3)")
    expect(folded[2].weight).toBeCloseTo(100 - folded[0].weight - folded[1].weight)
  })
})
