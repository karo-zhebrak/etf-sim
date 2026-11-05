"use client"

import { useMemo, useState } from "react"

import { correlationMatrix, describeCorrelation, MIN_WEEKS } from "@/lib/correlation"
import type { PriceSeries } from "@/lib/performance"
import { cn } from "@/lib/utils"

import type { FundLabel } from "./exposure-charts"
import { formatDay } from "./performance-chart"

// Diverging scale: blue (positive) <-> red (negative) with a neutral grey midpoint, equal
// steps per arm. Text switches to white on the two darkest steps of each arm.
const NEUTRAL = { bg: "#f0efec", fg: "#0b0b0b" }
const POSITIVE = [
  { min: 0.2, bg: "#b7d3f6", fg: "#0b0b0b" },
  { min: 0.4, bg: "#86b6ef", fg: "#0b0b0b" },
  { min: 0.6, bg: "#3987e5", fg: "#ffffff" },
  { min: 0.8, bg: "#1c5cab", fg: "#ffffff" },
]
const NEGATIVE = [
  { min: 0.2, bg: "#f6cfce", fg: "#0b0b0b" },
  { min: 0.4, bg: "#ee9e9d", fg: "#0b0b0b" },
  { min: 0.6, bg: "#e34948", fg: "#ffffff" },
  { min: 0.8, bg: "#b03130", fg: "#ffffff" },
]

function cellColor(r: number) {
  const arm = r >= 0 ? POSITIVE : NEGATIVE
  const step = [...arm].reverse().find((s) => Math.abs(r) >= s.min)
  return step ?? NEUTRAL
}

const fmt = new Intl.NumberFormat("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: "negative" })
const fmtR = (r: number) => fmt.format(r).replace("-", "−")

/** Chart E: how closely the selected ETFs move together (weekly returns). */
export function CorrelationMatrix({ series, start, funds, currency }: {
  series: PriceSeries[]
  start: string
  funds: Map<string, FundLabel>
  currency: string
}) {
  const result = useMemo(() => correlationMatrix(series, start), [series, start])
  const [active, setActive] = useState<[number, number] | null>(null)
  const keys = series.map((s) => s.key)
  const short = (k: string) => funds.get(k)?.short ?? k
  const tooShort = keys.length > 1 && result.weeks < MIN_WEEKS

  const reading = active && active[0] !== active[1] ? (() => {
    const r = result.matrix[active[0]][active[1]]
    return r === null ? null : `${short(keys[active[0]])} and ${short(keys[active[1]])}: ${fmtR(r)}, they ${describeCorrelation(r)}.`
  })() : null

  return (
    <section aria-labelledby="corr-heading" className="space-y-3 rounded-xl border bg-card p-4 sm:p-5">
      <div className="space-y-1">
        <h3 id="corr-heading" className="font-semibold">Correlation matrix</h3>
        <p className="text-sm text-muted-foreground">
          How closely your ETFs move together, from −1 (opposite directions) to +1 (in step).
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-0.5 text-sm">
          <caption className="sr-only">Correlation of weekly returns between each pair of selected ETFs</caption>
          <thead>
            <tr>
              <td />
              {keys.map((k) => (
                <th key={k} scope="col" className="px-1 pb-1 text-center text-xs font-medium" title={funds.get(k)?.name}>
                  {short(k)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {keys.map((row, i) => (
              <tr key={row}>
                <th scope="row" className="pr-2 text-right text-xs font-medium whitespace-nowrap" title={funds.get(row)?.name}>
                  {short(row)}
                </th>
                {keys.map((col, j) => {
                  const r = result.matrix[i][j]
                  const diagonal = i === j
                  const color = diagonal || r === null ? NEUTRAL : cellColor(r)
                  const label = r === null ? "not enough data"
                    : diagonal ? "1.00, an ETF compared with itself"
                    : `${fmtR(r)}: ${short(row)} and ${short(col)} ${describeCorrelation(r)}`
                  return (
                    <td key={col} className="p-0">
                      <div
                        tabIndex={diagonal ? undefined : 0}
                        aria-label={label}
                        title={label}
                        onMouseEnter={() => setActive([i, j])}
                        onMouseLeave={() => setActive(null)}
                        onFocus={() => setActive([i, j])}
                        onBlur={() => setActive(null)}
                        className={cn(
                          "flex h-12 w-14 items-center justify-center rounded tabular-nums sm:w-16",
                          diagonal && "text-muted-foreground",
                          !diagonal && "cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                          active && !diagonal && active[0] === i && active[1] === j && "ring-2 ring-foreground/60",
                        )}
                        style={{ background: color.bg, color: diagonal ? undefined : color.fg }}
                      >
                        {r === null ? "—" : diagonal ? "1.00" : fmtR(r)}
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="min-h-5 text-sm" aria-live="polite">
        {reading ?? <span className="text-muted-foreground">Hover over or tab to a cell to read it.</span>}
      </p>

      {/* Colour key */}
      <div className="space-y-1" aria-hidden>
        <div className="flex max-w-sm gap-0.5">
          {[...NEGATIVE].reverse().map((s) => <span key={`n${s.min}`} className="h-3 flex-1 rounded-sm" style={{ background: s.bg }} />)}
          <span className="h-3 flex-1 rounded-sm" style={{ background: NEUTRAL.bg }} />
          {POSITIVE.map((s) => <span key={`p${s.min}`} className="h-3 flex-1 rounded-sm" style={{ background: s.bg }} />)}
        </div>
        <div className="flex max-w-sm justify-between text-xs text-muted-foreground">
          <span>−1 opposite</span><span>0 unrelated</span><span>+1 in step</span>
        </div>
      </div>

      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="ETF key">
        {keys.map((k) => (
          <li key={k}><span className="font-medium text-foreground">{short(k)}</span> {funds.get(k)?.name}</li>
        ))}
      </ul>

      <div className="space-y-1 text-xs text-muted-foreground">
        {keys.length === 1 && <p>Add another ETF to compare how your funds move together.</p>}
        {tooShort && <p>The selected period is too short for a reliable figure: at least {MIN_WEEKS} weeks are needed.</p>}
        {result.from && result.to && (
          <p>
            Based on {result.weeks} weekly returns in {currency}, {formatDay(result.from)} to {formatDay(result.to)}.
            Funds that move less in step can make a portfolio&apos;s ups and downs smoother; that relationship can change over time.
          </p>
        )}
      </div>
    </section>
  )
}
