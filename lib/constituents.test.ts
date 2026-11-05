import { describe, expect, it } from "vitest"

import { combineConstituents, type FundHoldings, normaliseName, topIsComplete } from "./constituents"

describe("normaliseName", () => {
  it.each([
    ["APPLE", "APPLE"],
    ["Apple Inc", "APPLE"],
    ["ALPHABET CLASS A", "ALPHABET"],
    ["Alphabet Inc Class C", "ALPHABET"],
    ["JPMORGAN CHASE & CO", "JPMORGAN CHASE"],
    ["JPMorgan Chase & Co", "JPMORGAN CHASE"],
    ["SAMSUNG ELECTRONICS LTD", "SAMSUNG ELECTRONICS"],
    ["Samsung Electronics Co Ltd", "SAMSUNG ELECTRONICS"],
    ["AMAZON.COM INC", "AMAZONCOM"],
    ["Amazon.com Inc", "AMAZONCOM"],
    ["META PLATFORMS CLASS A", "META PLATFORMS"],
    ["Meta Platforms Inc Class A", "META PLATFORMS"],
    ["SK HYNIX", "SK HYNIX"],
    ["SK hynix Inc", "SK HYNIX"],
    ["APPLE HOSPITALITY REIT INC", "APPLE HOSPITALITY REIT"],
  ])("%s -> %s", (input, expected) => {
    expect(normaliseName(input)).toBe(expected)
  })
})

const fund = (isin: string, holdings: [string, string | null, number][], extra: Partial<FundHoldings> = {}): FundHoldings => ({
  isin, assetClass: "equity", asOf: "2026-11-02", truncated: false,
  holdings: holdings.map(([name, hIsin, weight]) => ({ name, ticker: null, isin: hIsin, weight })),
  ...extra,
})

describe("combineConstituents", () => {
  const ISH = fund("SWDA", [["APPLE", null, 6], ["ALPHABET CLASS A", null, 2], ["ALPHABET CLASS C", null, 1.5], ["TAIWAN SEMICONDUCTOR MANUFAC", null, 1], ["APPLE HOSPITALITY REIT INC", null, 0.1]])
  const HSBC = fund("HSWO", [["Apple Inc", "US0378331005", 4], ["Taiwan Semiconductor Manufacturing Co Ltd", "TW0002330008", 2], ["Alphabet Inc Class A", "US02079K3059", 1]])

  it("matches the same company across issuers, share classes and truncated names", () => {
    const rows = combineConstituents([ISH, HSBC], [0.5, 0.5])
    const byLabel = Object.fromEntries(rows.map((r) => [r.label, r.weight]))
    expect(byLabel["Apple Inc"]).toBeCloseTo(5) // 0.5×6 + 0.5×4
    expect(byLabel["Alphabet Inc"]).toBeCloseTo(2.25) // 0.5×(2+1.5) + 0.5×1
    expect(byLabel["Taiwan Semiconductor Manufacturing Co Ltd"]).toBeCloseTo(1.5) // truncated iShares name merged
    expect(byLabel["Apple Hospitality Reit Inc"]).toBeCloseTo(0.05) // not merged into Apple
    const apple = rows.find((r) => r.label === "Apple Inc")!
    expect(apple.contributions).toEqual([{ isin: "SWDA", weight: 3 }, { isin: "HSWO", weight: 2 }])
  })

  it("adds physical gold as one line and orders by weight", () => {
    const gold = fund("SGLN", [], { assetClass: "commodity" })
    const rows = combineConstituents([ISH, gold], [0.8, 0.2])
    expect(rows[0]).toMatchObject({ label: "Physical gold", weight: 20 })
    expect(rows[1].label).toBe("Apple")
  })

  it("labels a merged share-class group with the plain company name", () => {
    const f = fund("EIMI", [["SAMSUNG ELECTRONICS LTD", null, 6], ["SAMSUNG ELECTRONICS NON VOTI", null, 1]])
    const rows = combineConstituents([f], [1])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ label: "Samsung Electronics Ltd", weight: 7 })
  })

  it("matches by ISIN when names differ", () => {
    const a = fund("A", [["United States Treasury Notes", "US91282CKE09", 2]])
    const b = fund("B", [["US TREASURY N/B 4.375 15/09/29", "US91282CKE09", 1]])
    const rows = combineConstituents([a, b], [0.5, 0.5])
    expect(rows).toHaveLength(1)
    expect(rows[0].weight).toBeCloseTo(1.5)
  })
})

describe("topIsComplete", () => {
  it("is true when the 10th row is heavier than anything left unfetched", () => {
    const holdings: [string, string | null, number][] = Array.from({ length: 12 }, (_, i) => [`COMPANY ${String.fromCharCode(65 + i)}`, null, 12 - i])
    const f = fund("F", holdings, { truncated: true })
    const rows = combineConstituents([f], [1])
    expect(topIsComplete(rows, [f], [1])).toBe(true) // 10th = 3, last fetched = 1
    const tight = fund("G", holdings.map(([n, i]) => [n, i, 1] as [string, string | null, number]), { truncated: true })
    expect(topIsComplete(combineConstituents([tight], [1]), [tight], [1])).toBe(false)
  })
})
