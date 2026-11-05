"use client"

import { useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { combineConstituents, type FundHoldings, topIsComplete } from "@/lib/constituents"

import { loadTopHoldings } from "./actions"
import { BarList, type FundLabel } from "./exposure-charts"
import { formatDay } from "./performance-chart"

/** Loaded holdings per selection, kept for the browser session (same for every user). */
const holdingsCache = new Map<string, FundHoldings[]>()

/** Chart D: the ten largest holdings across the whole portfolio, overlaps combined. */
export function TopConstituents({ isins, fractions, funds }: {
  isins: string[]
  fractions: number[]
  funds: Map<string, FundLabel>
}) {
  const key = isins.join(",")
  const [last, setLast] = useState<FundHoldings[] | null>(null)
  const [errorKey, setErrorKey] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (holdingsCache.has(key)) return
    let cancelled = false
    loadTopHoldings(isins)
      .then((data) => {
        if (cancelled) return
        if (!data) return setErrorKey(key)
        holdingsCache.set(key, data)
        setLast(data)
      })
      .catch(() => !cancelled && setErrorKey(key))
    return () => {
      cancelled = true
    }
    // key encodes isins
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt])

  const cached = holdingsCache.get(key)
  const data = cached ?? (last && last.length === isins.length && last.every((f, i) => f.isin === isins[i]) ? last : null)
  const rows = useMemo(() => (data ? combineConstituents(data, fractions) : []), [data, fractions])

  if (!cached && errorKey === key) {
    return (
      <div className="space-y-3 rounded-xl border p-5 text-sm">
        <p role="alert" className="text-destructive">We couldn&apos;t load the holdings. Please try again.</p>
        <Button variant="outline" size="sm" onClick={() => {
          setErrorKey(null)
          setAttempt((a) => a + 1)
        }}>Try again</Button>
      </div>
    )
  }
  if (!data) {
    return <div className="h-72 animate-pulse rounded-xl border bg-muted/40" aria-busy="true" aria-label="Loading holdings" />
  }

  const top = rows.slice(0, 10)
  const complete = topIsComplete(rows, data, fractions)
  const overlaps = top.filter((r) => r.contributions.length > 1).length
  const noHoldings = data.filter((f) => f.assetClass !== "commodity" && f.holdings.length === 0)
  const dated = data.filter((f) => f.asOf).map((f) => `${funds.get(f.isin)?.short ?? f.isin} ${formatDay(f.asOf!)}`)

  return (
    <section aria-labelledby="top-heading" className="space-y-3 rounded-xl border bg-card p-4 sm:p-5">
      <div className="space-y-1">
        <h3 id="top-heading" className="font-semibold">Top 10 portfolio constituents</h3>
        <p className="text-sm text-muted-foreground">
          The largest holdings across your whole portfolio, with holdings that appear in more than one ETF added together.
        </p>
      </div>
      {top.length === 0 ? (
        <p className="text-sm text-muted-foreground">No holdings data is available for the selected ETFs.</p>
      ) : (
        <BarList rows={top} funds={funds} label="Top constituents" />
      )}
      <div className="space-y-1 text-xs text-muted-foreground">
        <p>
          Select a bar to see which of your ETFs hold it.
          {overlaps > 0 && ` ${overlaps} of these ${overlaps === 1 ? "is" : "are"} held by more than one of your ETFs.`}
        </p>
        <p>
          Approximate: fund issuers name companies differently, so holdings are matched by name (and by ISIN where
          available), and share classes of the same company (such as Alphabet A and C) are combined. Cash and currency
          hedges are left out.
        </p>
        {!complete && <p>Based on each ETF&apos;s 100 largest holdings; smaller holdings could change the lower positions slightly.</p>}
        {noHoldings.length > 0 && <p>No holdings data for {noHoldings.map((f) => funds.get(f.isin)?.short ?? f.isin).join(", ")}.</p>}
        {dated.length > 0 && <p>Holdings as published by each fund issuer, as of: {dated.join(" · ")}.</p>}
      </div>
    </section>
  )
}
