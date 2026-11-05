import { describe, expect, it } from "vitest"

import { correlationMatrix, describeCorrelation, MIN_WEEKS, pearson, returns, weeklyPrices } from "./correlation"
import type { PriceSeries } from "./performance"

const s = (key: string, points: [string, number][]): PriceSeries => ({
  key, dates: points.map((p) => p[0]), values: points.map((p) => p[1]),
})

/** Weekday dates from a Monday, `weeks` weeks long. */
function weekdays(fromIso: string, weeks: number): string[] {
  const out: string[] = []
  const start = Date.parse(`${fromIso}T00:00:00Z`)
  for (let d = 0; d < weeks * 7; d++) {
    const date = new Date(start + d * 86_400_000)
    if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) out.push(date.toISOString().slice(0, 10))
  }
  return out
}

describe("pearson", () => {
  it("is 1 for perfectly related samples, -1 for opposite, null with no variation", () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1)
    expect(pearson([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1)
    expect(pearson([1, 1, 1], [1, 2, 3])).toBeNull()
  })
  it("matches a hand-computed value", () => {
    // x = 1..5, y = 2,1,4,3,5 -> r = 0.8
    expect(pearson([1, 2, 3, 4, 5], [2, 1, 4, 3, 5])).toBeCloseTo(0.8)
  })
})

describe("weeklyPrices", () => {
  it("takes the last price date of each week and carries a missing price forward", () => {
    // Mon 5 Jan 2026 .. Fri 16 Jan; B has no price on Fri 9 Jan (holiday).
    const a = s("A", [["2026-01-05", 10], ["2026-01-09", 11], ["2026-01-12", 12], ["2026-01-16", 13]])
    const b = s("B", [["2026-01-05", 20], ["2026-01-08", 21], ["2026-01-12", 22], ["2026-01-16", 23]])
    const w = weeklyPrices([a, b], "2026-01-01")
    expect(w.dates).toEqual(["2026-01-09", "2026-01-16"])
    expect(w.prices).toEqual([[11, 13], [21, 23]])
    expect(returns(w.prices[0])).toEqual([13 / 11 - 1])
  })

  it("starts at the later of `start` and the first common date, ends at the earliest last date", () => {
    const a = s("A", [["2026-01-05", 1], ["2026-01-12", 2], ["2026-01-19", 3], ["2026-01-26", 4]])
    const b = s("B", [["2026-01-12", 1], ["2026-01-19", 2]])
    expect(weeklyPrices([a, b], "2026-01-01").dates).toEqual(["2026-01-12", "2026-01-19"])
  })
})

describe("correlationMatrix", () => {
  const dates = weekdays("2025-01-06", 60)
  // A follows a zig-zag; B = A doubled (perfectly correlated); C = opposite of A.
  const wave = dates.map((_, i) => 100 + 10 * Math.sin(i / 3))
  const A = s("A", dates.map((d, i) => [d, wave[i]]))
  const B = s("B", dates.map((d, i) => [d, 2 * wave[i]]))
  const C = s("C", dates.map((d, i) => [d, 300 - wave[i]]))

  it("has 1 on the diagonal and is symmetric", () => {
    const { matrix, weeks } = correlationMatrix([A, B, C], "2025-01-01")
    expect(weeks).toBeGreaterThanOrEqual(MIN_WEEKS)
    expect(matrix[0][0]).toBe(1)
    expect(matrix[0][1]).toBeCloseTo(1, 6)
    expect(matrix[1][0]).toBeCloseTo(matrix[0][1]!, 12)
    expect(matrix[0][2]!).toBeLessThan(-0.9)
  })

  it("leaves off-diagonal cells empty when the period is too short", () => {
    const { matrix, weeks } = correlationMatrix([A, B], dates[dates.length - 30])
    expect(weeks).toBeLessThan(MIN_WEEKS)
    expect(matrix[0][1]).toBeNull()
    expect(matrix[0][0]).toBe(1)
  })

  it("describes strength in plain English", () => {
    expect(describeCorrelation(0.92)).toBe("tend to move together very strongly")
    expect(describeCorrelation(0.05)).toBe("little or no relationship")
    expect(describeCorrelation(-0.45)).toBe("tend to move in opposite directions, moderately")
  })
})
