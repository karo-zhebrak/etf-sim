"use client"

import { useMemo, useState } from "react"
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts"

import { Button } from "@/components/ui/button"
import { axisTicks, type ChartRow, chartRows, endLabelsFit, normalise, type PriceSeries, totalReturn } from "@/lib/performance"

export type LineSpec = { key: string; label: string; color: string; dashed?: boolean }

// Text and chrome tokens (light theme; the app has no dark theme yet).
const INK = { primary: "#0b0b0b", secondary: "#52514e", muted: "#8a8984", grid: "#e8e7e3", surface: "#ffffff" }

const dayFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
const monthFmt = new Intl.DateTimeFormat("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" })
const yearFmt = new Intl.DateTimeFormat("en-GB", { year: "numeric", timeZone: "UTC" })
const idxFmt = new Intl.NumberFormat("en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const pctFmt = new Intl.NumberFormat("en-GB", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: "exceptZero" })
const toDate = (iso: string) => new Date(`${iso}T00:00:00Z`)
export const formatDay = (iso: string) => dayFmt.format(toDate(iso))

/** Annualised return over the period; null if shorter than a year. */
function annualised(total: number | null, startIso: string, endIso: string): number | null {
  if (total === null) return null
  const years = (toDate(endIso).getTime() - toDate(startIso).getTime()) / 86_400_000 / 365.25
  return years >= 1 ? (1 + total) ** (1 / years) - 1 : null
}

/** Line chart of each series indexed to 100 at `start` (spec 3.4 A and F). */
export function PerformanceChart({ series, lines, start, title, description, footnote }: {
  series: PriceSeries[]
  lines: LineSpec[]
  start: string
  title: string
  description: string
  footnote: React.ReactNode
}) {
  const [showTable, setShowTable] = useState(false)
  const normalised = useMemo(() => normalise(series, start), [series, start])
  const rows = useMemo(() => chartRows(normalised), [normalised])
  const spanYears = rows.length > 1 ? (toDate(rows[rows.length - 1].date).getTime() - toDate(rows[0].date).getTime()) / 86_400_000 / 365.25 : 0
  const tickFmt = (iso: string) => (spanYears > 4 ? yearFmt : monthFmt).format(toDate(iso))
  const byKey = new Map(normalised.map((s) => [s.key, s]))
  const ticks = useMemo(() => axisTicks(rows.map((r) => r.date), spanYears > 4), [rows, spanYears])
  // Direct labels for 4 lines or fewer, and only when their ends don't collide; otherwise the
  // legend and tooltip carry the values.
  const directLabels = useMemo(() => {
    if (lines.length > 4) return false
    const ends = normalised.filter((s) => s.values.length).map((s) => s.values[s.values.length - 1])
    const all = rows.flatMap((r) => lines.map((l) => r[l.key]).filter((v): v is number => typeof v === "number"))
    return endLabelsFit(ends, all)
  }, [lines, normalised, rows])
  // Each line ends at its own last price (the benchmark can end a day earlier than funds).
  const lastIndex = useMemo(() => {
    const out = new Map<string, number>()
    rows.forEach((r, i) => lines.forEach((l) => typeof r[l.key] === "number" && out.set(l.key, i)))
    return out
  }, [rows, lines])

  const tableRows = lines.map((l) => {
    const s = byKey.get(l.key)
    const total = s ? totalReturn(s) : null
    const end = s && s.dates.length ? s.dates[s.dates.length - 1] : null
    return { ...l, total, end, annual: s && end ? annualised(total, s.dates[0], end) : null, last: s?.values[s.values.length - 1] ?? null }
  })

  return (
    <section aria-labelledby={`${title}-heading`} className="space-y-3 rounded-xl border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <h3 id={`${title}-heading`} className="font-semibold">{title}</h3>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setShowTable((v) => !v)} aria-pressed={showTable}>
          {showTable ? "Show chart" : "Show table"}
        </Button>
      </div>

      {/* Legend: always present, so identity is never colour alone. */}
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Legend">
        {lines.map((l) => (
          <li key={l.key} className="flex items-center gap-1.5">
            <svg width="18" height="8" aria-hidden className="shrink-0">
              <line x1="1" y1="4" x2="17" y2="4" stroke={l.color} strokeWidth="2.5" strokeLinecap="round"
                    strokeDasharray={l.dashed ? "4 3" : undefined} />
            </svg>
            <span className="text-foreground">{l.label}</span>
          </li>
        ))}
      </ul>

      {showTable ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">{title}: values at the end of the period, starting from 100 on {formatDay(start)}</caption>
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th scope="col" className="py-2 pr-3 font-normal">Series</th>
                <th scope="col" className="py-2 pr-3 text-right font-normal">Value (start = 100)</th>
                <th scope="col" className="py-2 pr-3 text-right font-normal">Total return</th>
                <th scope="col" className="py-2 text-right font-normal">A year, on average</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((r) => (
                <tr key={r.key} className="border-b last:border-0">
                  <th scope="row" className="py-2 pr-3 text-left font-normal">{r.label}</th>
                  <td className="py-2 pr-3 text-right tabular-nums">{r.last === null ? "—" : idxFmt.format(r.last)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{r.total === null ? "—" : pctFmt.format(r.total)}</td>
                  <td className="py-2 text-right tabular-nums">{r.annual === null ? "—" : pctFmt.format(r.annual)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted-foreground">
            From {formatDay(start)} to each series&apos; latest price. &ldquo;A year, on average&rdquo; is the
            annualised return, shown for periods of a year or more.
          </p>
        </div>
      ) : (
        <div className="h-72 sm:h-80" role="img" aria-label={`${title}. Use "Show table" for the values.`}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 8, right: directLabels ? 56 : 12, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke={INK.grid} strokeWidth={1} />
              <XAxis dataKey="date" ticks={ticks} tickFormatter={tickFmt} minTickGap={24} tickLine={false}
                     axisLine={{ stroke: INK.grid }} tick={{ fill: INK.secondary, fontSize: 12 }} />
              <YAxis width={44} tickLine={false} axisLine={false} domain={["auto", "auto"]}
                     tick={{ fill: INK.secondary, fontSize: 12 }} tickFormatter={(v: number) => String(Math.round(v))} />
              <Tooltip
                cursor={{ stroke: INK.muted, strokeWidth: 1 }}
                isAnimationActive={false}
                content={(props) => (
                  <ChartTooltip active={props.active} payload={props.payload} label={props.label} lines={lines} />
                )}
              />
              {lines.map((l) => (
                <Line
                  key={l.key}
                  dataKey={l.key}
                  name={l.label}
                  stroke={l.color}
                  strokeWidth={2}
                  strokeDasharray={l.dashed ? "6 4" : undefined}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  dot={false}
                  activeDot={{ r: 4, stroke: INK.surface, strokeWidth: 2 }}
                  connectNulls={false}
                  isAnimationActive={false}
                  label={directLabels ? (p) => <EndLabel {...p} last={lastIndex.get(l.key) ?? -1} /> : undefined}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      <div className="space-y-1 text-xs text-muted-foreground">{footnote}</div>
    </section>
  )
}

/** Final value printed at the right end of a line (only when there are 4 lines or fewer). */
function EndLabel(props: { x?: number | string; y?: number | string; index?: number; value?: unknown; last: number }) {
  const { x, y, index, value, last } = props
  if (index !== last || typeof value !== "number" || x === undefined || y === undefined) return null
  return (
    <text x={Number(x) + 6} y={Number(y)} dy={4} fontSize={12} fill={INK.primary} className="tabular-nums">
      {Math.round(value)}
    </text>
  )
}

function ChartTooltip({ active, payload, label, lines }: {
  active?: boolean
  payload?: readonly { payload?: unknown }[]
  label?: unknown
  lines: LineSpec[]
}) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload as ChartRow
  return (
    <div className="min-w-48 rounded-lg border bg-popover p-2.5 text-xs shadow-md">
      <p className="mb-1.5 font-medium">{formatDay(String(label))}</p>
      <ul className="space-y-1">
        {lines.map((l) => {
          const v = row[l.key]
          return (
            <li key={l.key} className="flex items-center gap-2">
              <span className="inline-block h-0.5 w-3 shrink-0 rounded" style={{ background: l.color }} aria-hidden />
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{l.label}</span>
              <span className="tabular-nums">
                {typeof v === "number" ? `${idxFmt.format(v)} (${pctFmt.format(v / 100 - 1)})` : "—"}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
