"use client"

import { useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import type { EtfOption } from "@/lib/etf-types"
import { buyAndHold, commonStart, normalise, type PriceSeries, type RangeId, rangeOptions } from "@/lib/performance"
import type { Currency } from "@/lib/portfolio-rules"
import { formatMoney } from "@/lib/format"
import { cn } from "@/lib/utils"

import { loadPriceSeries } from "./actions"
import { CorrelationMatrix } from "./correlation-matrix"
import { ExposureCharts, type FundLabel } from "./exposure-charts"
import { formatDay, type LineSpec, PerformanceChart } from "./performance-chart"
import { TopConstituents } from "./top-constituents"
import { SERIES_COLORS } from "./series-colors"

/** Loaded series per currency + selection, kept for the browser session (same for every user). */
const seriesCache = new Map<string, PriceSeries[]>()

/** "Your portfolio" has its own validated categorical slot (violet), never a fund's colour. */
const PORTFOLIO = { key: "PORTFOLIO", label: "Your portfolio", color: "#6250d6" }
const BENCHMARK = { key: "MSCI_WORLD", label: "MSCI World Index (benchmark)", color: "#52514e" }

export function AnalysisStep({ isins, fractions, amount, colors, etfOptions, currency, onBack }: {
  isins: string[]
  /** Allocation as exact fractions (equal = 1/n), aligned with isins. */
  fractions: number[]
  amount: number | null
  /** Fund colours, owned by the builder so they survive switching steps. */
  colors: Map<string, string>
  etfOptions: EtfOption[]
  currency: Currency
  onBack: () => void
}) {
  const [last, setLast] = useState<PriceSeries[] | null>(null)
  const [errorKey, setErrorKey] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [range, setRange] = useState<RangeId | null>(null)
  const key = `${currency}:${isins.join(",")}`

  // Fetch series not already in the session cache. Cached data is read during render.
  useEffect(() => {
    if (seriesCache.has(key)) return
    let cancelled = false
    loadPriceSeries(isins, currency)
      .then((series) => {
        if (cancelled) return
        if (!series) return setErrorKey(key)
        seriesCache.set(key, series)
        setLast(series)
      })
      .catch(() => !cancelled && setErrorKey(key))
    return () => {
      cancelled = true
    }
    // key encodes isins and currency
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt])

  const names = useMemo(() => new Map(etfOptions.map((o) => [o.isin, o])), [etfOptions])
  const cached = seriesCache.get(key)
  // While new data loads, keep showing the previous chart, dimmed (no layout jump).
  const series = cached ?? last
  const refreshing = !cached

  if (!cached && errorKey === key) {
    return (
      <div className="space-y-3 rounded-xl border p-5 text-sm">
        <p role="alert" className="text-destructive">We couldn&apos;t load the price history. Please try again.</p>
        <Button variant="outline" size="sm" onClick={() => {
          setErrorKey(null)
          setAttempt((a) => a + 1)
        }}>Try again</Button>
      </div>
    )
  }
  if (!series) {
    return <div className="h-96 animate-pulse rounded-xl border bg-muted/40" aria-busy="true" aria-label="Loading analysis" />
  }

  // Funds in selection order, then the benchmark.
  const bySeries = new Map(series.map((s) => [s.key, s]))
  const fundSeries = isins.map((i) => bySeries.get(i) ?? { key: i, dates: [], values: [] })
  const benchmark = bySeries.get(BENCHMARK.key)
  const shown = benchmark ? [...fundSeries, benchmark] : fundSeries
  const options = rangeOptions(shown)
  const defaultRange = (["5Y", "3Y", "1Y"] as RangeId[]).find((id) => options.find((o) => o.id === id)?.available) ?? "MAX"
  const active = options.find((o) => o.id === (range ?? defaultRange) && o.available) ?? options.find((o) => o.id === "MAX")
  const start = active?.start ?? commonStart(shown)

  const lines: LineSpec[] = [
    ...isins.map((i) => {
      const etf = names.get(i)
      return { key: i, label: etf ? `${etf.name}${etf.ticker ? ` (${etf.ticker})` : ""}` : i, color: colors.get(i) ?? SERIES_COLORS[0] }
    }),
    ...(benchmark ? [{ ...BENCHMARK, dashed: true }] : []),
  ]
  const portfolio = start ? buyAndHold(PORTFOLIO.key, normalise(fundSeries, start), fractions) : null
  const fundLabels = new Map<string, FundLabel>(isins.map((i) => {
    const etf = names.get(i)
    return [i, { name: etf?.name ?? i, short: etf?.ticker ?? etf?.name ?? i, color: colors.get(i) ?? SERIES_COLORS[0] }]
  }))
  const firstDates = shown.map((s) => ({ key: s.key, first: s.dates[0] }))
  const limiting = firstDates.filter((f) => f.first === commonStart(shown)).map((f) => (f.key === BENCHMARK.key ? "MSCI World" : names.get(f.key)?.name ?? f.key))

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">Portfolio analysis</h2>
        <p className="text-sm text-muted-foreground">
          How your selection behaved in the past and what it holds today. These are illustrations for learning,
          not a forecast or a recommendation.
        </p>
      </div>
      {/* Filters: one row above the charts they scope. */}
      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Time range" className="inline-flex rounded-lg border p-1">
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              disabled={!o.available}
              aria-pressed={active?.id === o.id}
              onClick={() => setRange(o.id)}
              title={o.available ? undefined : `Not enough shared history: the selected funds all have prices from ${formatDay(options.find((x) => x.id === "MAX")!.start)}`}
              className={cn(
                "rounded-md px-3 py-1 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                active?.id === o.id ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
        <span className="text-sm text-muted-foreground">
          In {currency}{start ? ` · from ${formatDay(start)}` : ""}
        </span>
      </div>

      {!start && <div className="h-96 animate-pulse rounded-xl border bg-muted/40" aria-busy="true" aria-label="Loading analysis" />}
      {start && (
        <div className={cn("transition-opacity", refreshing && "opacity-50")} aria-busy={refreshing || undefined}>
          <PerformanceChart
            title="Historical performance"
            description={`How ${isins.length === 1 ? "your ETF" : "each ETF"} and the MSCI World Index grew, starting from 100.`}
            series={shown}
            lines={lines}
            start={start}
            footnote={
              <>
                <p>
                  ETF performance is after each fund&apos;s ongoing charge (TER), with income reinvested. MSCI World
                  is an index, so it has no fees. Values are converted into {currency} using European Central Bank
                  reference rates.
                </p>
                {active?.id === "MAX" && limiting.length > 0 && (
                  <p>Max starts on {formatDay(start)}, the first date with prices for {limiting.join(" and ")}.</p>
                )}
                <p className="font-medium text-foreground">Past performance does not predict future returns.</p>
              </>
            }
          />
        </div>
      )}

      {/* Charts B and C: where the money is invested (latest holdings, not time-based). */}
      <ExposureCharts isins={isins} fractions={fractions} funds={fundLabels} />

      {/* Chart D: largest holdings across the portfolio (latest holdings, not time-based). */}
      <TopConstituents isins={isins} fractions={fractions} funds={fundLabels} />

      {/* Chart E: scoped by the same time range as the performance charts. */}
      {start && (
        <div className={cn("transition-opacity", refreshing && "opacity-50")}>
          <CorrelationMatrix series={fundSeries} start={start} funds={fundLabels} currency={currency} />
        </div>
      )}

      {start && portfolio && portfolio.values.length > 0 && (
        <div className={cn("transition-opacity", refreshing && "opacity-50")}>
          <PerformanceChart
            title="Combined portfolio performance"
            description={amount === null
              ? "Your whole portfolio at its allocation, against the MSCI World Index, starting from 100."
              : `What ${formatMoney(amount, currency)} invested at your allocation would have grown to, against the MSCI World Index.`}
            series={benchmark ? [portfolio, benchmark] : [portfolio]}
            lines={[PORTFOLIO, ...(benchmark ? [{ ...BENCHMARK, dashed: true }] : [])]}
            start={start}
            money={amount === null ? undefined : { amount, currency }}
            footnote={
              <>
                <p>
                  Buy and hold: invested at your allocation on {formatDay(start)} and never rebalanced, so each
                  fund&apos;s share drifts with its price. After each fund&apos;s ongoing charge (TER), with income
                  reinvested. No platform fees, dealing costs or taxes are included. MSCI World is an index, so it
                  has no fees.
                </p>
                {amount === null && <p>Enter an investment amount in step 1 to see values in {currency}.</p>}
                <p className="font-medium text-foreground">Past performance does not predict future returns.</p>
              </>
            }
          />
        </div>
      )}

      <Button variant="outline" onClick={onBack}>Back to ETF selection</Button>
    </div>
  )
}
