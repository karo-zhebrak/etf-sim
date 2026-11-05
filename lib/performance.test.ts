import { describe, expect, it } from "vitest"

import {
  axisTicks, buyAndHold, chartRows, commonStart, endLabelsFit, latestDate, normalise, type PriceSeries, rangeOptions,
  totalReturn,
  yearsBefore,
} from "./performance"

const s = (key: string, points: [string, number][]): PriceSeries => ({
  key, dates: points.map((p) => p[0]), values: points.map((p) => p[1]),
})

describe("yearsBefore", () => {
  it("goes back whole years", () => {
    expect(yearsBefore("2026-11-03", 1)).toBe("2025-11-03")
    expect(yearsBefore("2026-11-03", 5)).toBe("2021-11-03")
  })
  it("falls back from 29 February", () => {
    expect(yearsBefore("2024-02-29", 1)).toBe("2023-02-28")
  })
})

describe("common start and ranges", () => {
  const old = s("A", [["2010-01-04", 10], ["2026-11-03", 40]])
  const young = s("B", [["2022-12-08", 5], ["2026-11-02", 6]])

  it("starts when every series has a price", () => {
    expect(commonStart([old, young])).toBe("2022-12-08")
    expect(latestDate([old, young])).toBe("2026-11-03")
  })

  it("returns null when a series is empty", () => {
    expect(commonStart([old, s("C", [])])).toBeNull()
  })

  it("disables ranges longer than the shared history", () => {
    const opts = rangeOptions([old, young])
    expect(opts.map((o) => [o.id, o.available])).toEqual([["1Y", true], ["3Y", true], ["5Y", false], ["MAX", true]])
    expect(opts.find((o) => o.id === "1Y")!.start).toBe("2025-11-03")
    expect(opts.find((o) => o.id === "MAX")!.start).toBe("2022-12-08")
  })
})

describe("normalise", () => {
  it("indexes each series to 100 at its first price on or after the start", () => {
    // B has no price on the 5th (holiday), so it starts from the 6th.
    const a = s("A", [["2026-01-02", 50], ["2026-01-05", 55], ["2026-01-06", 60]])
    const b = s("B", [["2026-01-02", 8], ["2026-01-06", 10], ["2026-01-07", 12]])
    const [na, nb] = normalise([a, b], "2026-01-05")
    expect(na.dates).toEqual(["2026-01-05", "2026-01-06"])
    expect(na.values).toEqual([100, (60 / 55) * 100])
    expect(nb.dates[0]).toBe("2026-01-06")
    expect(nb.values).toEqual([100, 120])
  })

  it("total return is last over first", () => {
    expect(totalReturn(s("A", [["2026-01-01", 100], ["2026-02-01", 125]]))).toBeCloseTo(0.25)
    expect(totalReturn(s("A", [["2026-01-01", 100]]))).toBeNull()
  })
})

describe("chartRows", () => {
  it("merges dates, carries prices over gaps but not past a series' last price", () => {
    const a = s("A", [["2026-01-05", 100], ["2026-01-06", 101], ["2026-01-07", 102]])
    const b = s("B", [["2026-01-05", 100], ["2026-01-06", 99]])
    expect(chartRows([a, b])).toEqual([
      { date: "2026-01-05", A: 100, B: 100 },
      { date: "2026-01-06", A: 101, B: 99 },
      { date: "2026-01-07", A: 102, B: null },
    ])
  })

  it("forward-fills a holiday in one calendar", () => {
    const a = s("A", [["2026-01-05", 100], ["2026-01-06", 101], ["2026-01-07", 102]])
    const b = s("B", [["2026-01-05", 100], ["2026-01-07", 98]])
    expect(chartRows([a, b])[1]).toEqual({ date: "2026-01-06", A: 101, B: 100 })
  })

  it("thins long periods to one point a week, keeping the first and last dates", () => {
    const dates: [string, number][] = []
    for (let t = Date.UTC(2020, 0, 1); t <= Date.UTC(2023, 0, 1); t += 86_400_000) {
      const d = new Date(t)
      if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) dates.push([d.toISOString().slice(0, 10), 100])
    }
    const rows = chartRows([s("A", dates)])
    expect(rows[0].date).toBe(dates[0][0])
    expect(rows[rows.length - 1].date).toBe(dates[dates.length - 1][0])
    expect(rows.length).toBeLessThan(170)
    expect(rows.length).toBeGreaterThan(150)
  })

  it("keeps each series' own last date when thinning", () => {
    const long: [string, number][] = []
    for (let t = Date.UTC(2020, 0, 6); t <= Date.UTC(2023, 0, 3); t += 86_400_000) {
      const d = new Date(t)
      if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) long.push([d.toISOString().slice(0, 10), 100])
    }
    // B ends on Monday 2 Jan 2023; A ends on Tuesday 3 Jan 2023 (same week).
    const a = s("A", long)
    const b = s("B", long.filter(([d]) => d <= "2023-01-02").map(([d]) => [d, d === "2023-01-02" ? 90 : 100]))
    const rows = chartRows([a, b])
    const monday = rows.find((r) => r.date === "2023-01-02")
    expect(monday?.B).toBe(90)
  })
})

describe("axis ticks and end labels", () => {
  it("ticks on the first date of each new year or quarter", () => {
    const dates = ["2021-11-05", "2021-12-31", "2022-01-07", "2022-04-01", "2022-07-08", "2023-01-06"]
    expect(axisTicks(dates, true)).toEqual(["2022-01-07", "2023-01-06"])
    expect(axisTicks(dates, false)).toEqual(["2022-01-07", "2022-04-01", "2022-07-08", "2023-01-06"])
  })

  it("drops end labels when line ends are too close", () => {
    expect(endLabelsFit([226, 174, 166], [60, 300])).toBe(false) // 166 and 174 are 3% of the range apart
    expect(endLabelsFit([226, 174, 120], [60, 300])).toBe(true)
  })
})

describe("buyAndHold", () => {
  it("weights each fund's growth and lets weights drift", () => {
    const a = s("A", [["2026-01-05", 100], ["2026-01-06", 200]])
    const b = s("B", [["2026-01-05", 100], ["2026-01-06", 100]])
    const p = buyAndHold("P", [a, b], [0.5, 0.5])
    expect(p.values).toEqual([100, 150])
    // After A doubles, A is 2/3 of the portfolio: a further 10% rise in A adds 6.67%.
    const a2 = s("A", [["2026-01-05", 100], ["2026-01-06", 200], ["2026-01-07", 220]])
    const b2 = s("B", [["2026-01-05", 100], ["2026-01-06", 100], ["2026-01-07", 100]])
    const p2 = buyAndHold("P", [a2, b2], [0.5, 0.5])
    expect(p2.values[2] / p2.values[1] - 1).toBeCloseTo(1 / 15)
  })

  it("carries prices over holidays, treats a late first price as the start, and ends with the shortest series", () => {
    const a = s("A", [["2026-01-05", 100], ["2026-01-06", 110], ["2026-01-07", 120], ["2026-01-08", 130]])
    const b = s("B", [["2026-01-06", 100], ["2026-01-07", 90]]) // first price a day later; ends earlier
    const p = buyAndHold("P", [a, b], [0.25, 0.75])
    expect(p.dates).toEqual(["2026-01-05", "2026-01-06", "2026-01-07"])
    expect(p.values).toEqual([100, 0.25 * 110 + 0.75 * 100, 0.25 * 120 + 0.75 * 90])
  })

  it("returns an empty series when a fund has no data", () => {
    expect(buyAndHold("P", [s("A", [])], [1]).values).toEqual([])
  })
})
