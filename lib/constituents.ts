// Top constituents across the whole portfolio (spec 3.4 D). Pure functions, no I/O.
//
// Combined exposure to a holding = Σ (ETF weight × holding weight in that ETF).
// Issuers name the same company differently ("APPLE" vs "Apple Inc"), iShares truncates
// long names ("TAIWAN SEMICONDUCTOR MANUFAC") and only HSBC gives ISINs, so holdings are
// matched by ISIN where both sides have one, otherwise by normalised name (with a
// prefix rule for truncated names). Share classes of one company (Alphabet A and C) are
// combined. The result is labelled approximate in the UI.

import { type AssetClass, displayName } from "@/lib/etf-types"

export type Holding = { name: string; ticker: string | null; isin: string | null; weight: number }

export type FundHoldings = {
  isin: string
  assetClass: AssetClass | null
  asOf: string | null
  /** Largest real holdings, weight in percent, largest first (cash and hedges removed). */
  holdings: Holding[]
  /** True if the fund has more holdings than were fetched. */
  truncated: boolean
}

export type ConstituentRow = {
  key: string
  label: string
  weight: number
  contributions: { isin: string; weight: number }[]
}

const LEGAL_SUFFIXES = new Set([
  "INC", "INCORPORATED", "CORP", "CORPORATION", "CO", "COMPANY", "PLC", "LTD", "LIMITED", "LLC", "LP",
  "SA", "AG", "NV", "SE", "SPA", "AB", "ASA", "OYJ", "AS", "BHD", "TBK", "PCL", "KK", "THE", "AND",
])
const SHARE_CLASS = /\b(CLASS [A-Z]|CL [A-Z]|NON VOTING|NON VOTI\w*|PREF\w*|REGISTERED|REG|SHS|ADR|GDR|ORD|N)\b/g
/** Truncated names only match a longer name when at least this long (so "APPLE" never
 * matches "APPLE HOSPITALITY REIT"). */
const MIN_PREFIX = 12

/** Comparable form of a company name, e.g. "Alphabet Inc Class A" -> "ALPHABET". */
export function normaliseName(name: string): string {
  let s = name.toUpperCase().replace(/&/g, " AND ").replace(/[.,'’()/]/g, "").replace(/-/g, " ")
  s = s.replace(SHARE_CLASS, " ").replace(/\s+/g, " ").trim()
  const words = s.split(" ")
  while (words.length > 1 && LEGAL_SUFFIXES.has(words[words.length - 1])) words.pop()
  return words.join(" ")
}


type Group = { key: string; names: Set<string>; isins: Set<string>; weight: number; contributions: Map<string, number> }

/** Combined holdings across funds, largest first, with per-fund contributions. */
export function combineConstituents(funds: FundHoldings[], fractions: number[]): ConstituentRow[] {
  const groups: Group[] = []
  const byKey = new Map<string, Group>()
  const byIsin = new Map<string, Group>()

  const add = (g: Group, fundIsin: string, w: number, name: string, isin: string | null) => {
    g.weight += w
    g.names.add(name)
    if (isin) {
      g.isins.add(isin)
      byIsin.set(isin, g)
    }
    g.contributions.set(fundIsin, (g.contributions.get(fundIsin) ?? 0) + w)
  }

  funds.forEach((f, i) => {
    if (f.assetClass === "commodity") {
      const g = byKey.get("__GOLD__") ?? { key: "__GOLD__", names: new Set<string>(), isins: new Set<string>(), weight: 0, contributions: new Map() }
      if (!byKey.has("__GOLD__")) {
        byKey.set("__GOLD__", g)
        groups.push(g)
      }
      add(g, f.isin, fractions[i] * 100, "Physical gold", null)
      return
    }
    for (const h of f.holdings) {
      const w = fractions[i] * h.weight
      if (w <= 0) continue
      const key = normaliseName(h.name)
      const g = (h.isin && byIsin.get(h.isin)) || byKey.get(key)
      if (g) {
        add(g, f.isin, w, h.name, h.isin)
      } else {
        const created: Group = { key, names: new Set(), isins: new Set(), weight: 0, contributions: new Map() }
        byKey.set(key, created)
        groups.push(created)
        add(created, f.isin, w, h.name, h.isin)
      }
    }
  })

  // Merge truncated names into the longer name they start with (e.g. iShares' 28-character
  // "TAIWAN SEMICONDUCTOR MANUFAC" into "TAIWAN SEMICONDUCTOR MANUFACTURING").
  const merged = new Set<Group>()
  const sorted = [...groups].sort((a, b) => a.key.length - b.key.length)
  for (const short of sorted) {
    if (short.key.length < MIN_PREFIX || short.key === "__GOLD__") continue
    const long = sorted.find((g) => g !== short && !merged.has(g) && g.key.length > short.key.length && g.key.startsWith(short.key))
    if (!long) continue
    long.weight += short.weight
    short.names.forEach((n) => long.names.add(n))
    short.contributions.forEach((w, isin) => long.contributions.set(isin, (long.contributions.get(isin) ?? 0) + w))
    merged.add(short)
  }

  return groups
    .filter((g) => !merged.has(g))
    .map((g) => {
      const names = [...g.names]
      // Label: prefer a mixed-case name (HSBC's, never truncated); otherwise a name that is
      // just the company (normalises to the group key, so no share-class tags), shortest
      // first; otherwise the longest (least truncated) name.
      const plain = names.filter((n) => normaliseName(n) === g.key).sort((a, b) => a.length - b.length)
      const best = names.find((n) => n !== n.toUpperCase()) ?? plain[0] ?? names.sort((a, b) => b.length - a.length)[0]
      return {
        key: g.key,
        label: g.key === "__GOLD__" ? "Physical gold" : displayName(best).replace(/\s+Class [A-Z]$/i, ""),
        weight: g.weight,
        contributions: [...g.contributions].map(([isin, weight]) => ({ isin, weight })).sort((a, b) => b.weight - a.weight),
      }
    })
    .sort((a, b) => b.weight - a.weight)
}

/**
 * Whether the top `n` rows are certain to be complete even though only each fund's largest
 * holdings were fetched: a holding missing from every fetched list weighs at most the
 * largest "last fetched" weight among truncated funds (weights sum to 1), so if the n-th
 * row is heavier than that, nothing missing can enter the top n.
 */
export function topIsComplete(rows: ConstituentRow[], funds: FundHoldings[], fractions: number[], n = 10): boolean {
  const bound = Math.max(0, ...funds.map((f, i) => (f.truncated && f.holdings.length
    ? f.holdings[f.holdings.length - 1].weight * (fractions[i] > 0 ? 1 : 0) : 0)))
  if (bound === 0) return true
  const nth = rows[Math.min(n, rows.length) - 1]?.weight ?? 0
  return rows.length >= n && nth > bound
}
