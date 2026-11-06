import { describe, expect, it } from "vitest"

import { displayName } from "./etf-types"

describe("displayName", () => {
  it("title-cases all-caps names and keeps acronyms", () => {
    expect(displayName("HSBC MSCI WORLD UCITS ETF")).toBe("HSBC MSCI World UCITS ETF")
    expect(displayName("HSBC EURO STOXX 50 UCITS ETF")).toBe("HSBC EURO STOXX 50 UCITS ETF")
    expect(displayName("HSBC NASDAQ GLOBAL SEMICONDUCTOR UCITS ETF")).toBe("HSBC Nasdaq Global Semiconductor UCITS ETF")
  })

  it("treats a lower-case 'ex' inside an all-caps name as all caps", () => {
    expect(displayName("HSBC MSCI PACIFIC ex JAPAN UCITS ETF")).toBe("HSBC MSCI Pacific ex Japan UCITS ETF")
    expect(displayName("HSBC ASIA PACIFIC EX JAPAN SCREENED EQUITY UCITS ETF"))
      .toBe("HSBC Asia Pacific ex Japan Screened Equity UCITS ETF")
  })

  it("keeps mixed-case names as they are", () => {
    expect(displayName("iShares Core MSCI Pacific ex-Japan UCITS ETF")).toBe("iShares Core MSCI Pacific ex-Japan UCITS ETF")
  })
})
