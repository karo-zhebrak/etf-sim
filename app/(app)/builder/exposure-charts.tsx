"use client"

import { ChevronDown } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  assetClassSplit, type CombinedRow, combineCountries, combineEquitySectors, combineRegions, type FundExposure,
  HOME_COUNTRY, topN,
} from "@/lib/exposure"
import { cn } from "@/lib/utils"

import { loadExposures } from "./actions"
import { formatDay } from "./performance-chart"

const BAR_COLOR = "#2a78d6" // one series: categorical slot 1
/** Asset classes keep fixed colours (colour follows the entity). */
const ASSET_COLORS: Record<string, string> = {
  Equity: "#2a78d6", Bonds: "#1baf7a", Property: "#eb6834", Gold: "#eda100", "Multi-asset": "#e87ba4", Unclassified: "#8a8984",
}
const pct = new Intl.NumberFormat("en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const fmtPct = (v: number) => `${pct.format(v)}%`

/** Loaded breakdowns per selection, kept for the browser session (same for every user). */
const exposureCache = new Map<string, FundExposure[]>()

export type FundLabel = { name: string; short: string; color: string }

/** Charts B (geography) and C (sectors) for the combined portfolio. */
export function ExposureCharts({ isins, fractions, funds }: {
  isins: string[]
  fractions: number[]
  funds: Map<string, FundLabel>
}) {
  const key = isins.join(",")
  const [last, setLast] = useState<FundExposure[] | null>(null)
  const [errorKey, setErrorKey] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (exposureCache.has(key)) return
    let cancelled = false
    loadExposures(isins)
      .then((data) => {
        if (cancelled) return
        if (!data) return setErrorKey(key)
        exposureCache.set(key, data)
        setLast(data)
      })
      .catch(() => !cancelled && setErrorKey(key))
    return () => {
      cancelled = true
    }
    // key encodes isins
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt])

  const cached = exposureCache.get(key)
  const data = cached ?? (last && last.length === isins.length && last.every((f, i) => f.isin === isins[i]) ? last : null)

  if (!cached && errorKey === key) {
    return (
      <div className="space-y-3 rounded-xl border p-5 text-sm">
        <p role="alert" className="text-destructive">We couldn&apos;t load the exposure data. Please try again.</p>
        <Button variant="outline" size="sm" onClick={() => {
          setErrorKey(null)
          setAttempt((a) => a + 1)
        }}>Try again</Button>
      </div>
    )
  }
  if (!data) {
    return <div className="h-80 animate-pulse rounded-xl border bg-muted/40" aria-busy="true" aria-label="Loading exposure" />
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <GeographyCard data={data} fractions={fractions} funds={funds} />
      <SectorCard data={data} fractions={fractions} funds={funds} />
    </div>
  )
}

function AsOfNote({ data, field, funds }: { data: FundExposure[]; field: "countriesAsOf" | "sectorsAsOf"; funds: Map<string, FundLabel> }) {
  const dated = data.filter((f) => f[field]).map((f) => `${funds.get(f.isin)?.short ?? f.isin} ${formatDay(f[field]!)}`)
  if (dated.length === 0) return null
  return <p>Data as published by each fund issuer, as of: {dated.join(" · ")}.</p>
}

function GeographyCard({ data, fractions, funds }: { data: FundExposure[]; fractions: number[]; funds: Map<string, FundLabel> }) {
  const [view, setView] = useState<"countries" | "regions">("countries")
  const rows = useMemo(() => (view === "countries"
    ? topN(combineCountries(data, fractions), 10, "All other countries")
    : combineRegions(data, fractions)), [view, data, fractions])
  const homeFunds = data.filter((f) => f.countries.length === 0 && HOME_COUNTRY[f.isin])
  const hasGold = data.some((f) => f.assetClass === "commodity")
  return (
    <section aria-labelledby="geo-heading" className="space-y-3 rounded-xl border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <h3 id="geo-heading" className="font-semibold">Geographic exposure</h3>
          <p className="text-sm text-muted-foreground">Where your portfolio is invested, as a share of the total.</p>
        </div>
        <div role="group" aria-label="Group by" className="inline-flex rounded-lg border p-0.5 text-sm">
          {(["countries", "regions"] as const).map((v) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}
                    className={cn("rounded-md px-2.5 py-1 capitalize transition-colors",
                      view === v ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>
              {v}
            </button>
          ))}
        </div>
      </div>
      <BarList rows={rows} funds={funds} label={view === "countries" ? "Countries" : "Regions"} />
      <div className="space-y-1 text-xs text-muted-foreground">
        <p>Select a bar to see which of your ETFs it comes from.</p>
        {homeFunds.length > 0 && (
          <p>
            {homeFunds.map((f) => funds.get(f.isin)?.short ?? f.isin).join(", ")}{" "}
            {homeFunds.length === 1 ? "doesn't" : "don't"} publish a country breakdown, so{" "}
            {homeFunds.length === 1 ? "it is" : "they are"} counted as 100% in{" "}
            {homeFunds.length === 1 ? "its" : "their"} home country.
          </p>
        )}
        {hasGold && <p>Physical gold isn&apos;t tied to a country, so it has its own bar.</p>}
        <p>&ldquo;Other / not specified&rdquo; is the part issuers group together rather than list by country.</p>
        <AsOfNote data={data} field="countriesAsOf" funds={funds} />
      </div>
    </section>
  )
}

function SectorCard({ data, fractions, funds }: { data: FundExposure[]; fractions: number[]; funds: Map<string, FundLabel> }) {
  const split = useMemo(() => assetClassSplit(data, fractions), [data, fractions])
  const sectors = useMemo(() => combineEquitySectors(data, fractions), [data, fractions])
  const equityShare = split.find((r) => r.key === "Equity")?.weight ?? 0
  return (
    <section aria-labelledby="sector-heading" className="space-y-4 rounded-xl border bg-card p-4 sm:p-5">
      <div className="space-y-1">
        <h3 id="sector-heading" className="font-semibold">Sector exposure</h3>
        <p className="text-sm text-muted-foreground">What your portfolio holds, as a share of the total.</p>
      </div>

      <div className="space-y-2">
        <h4 className="text-sm font-medium">Asset classes</h4>
        {/* Segmented bar: one whole split into parts, with 2px surface gaps. */}
        <div className="flex h-4 w-full gap-0.5 overflow-hidden rounded" role="img"
             aria-label={split.map((r) => `${r.label} ${fmtPct(r.weight)}`).join(", ")}>
          {split.map((r) => (
            <div key={r.key} style={{ width: `${r.weight}%`, background: ASSET_COLORS[r.key] ?? ASSET_COLORS.Unclassified }} />
          ))}
        </div>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-label="Asset classes">
          {split.map((r) => (
            <li key={r.key} className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm" style={{ background: ASSET_COLORS[r.key] ?? ASSET_COLORS.Unclassified }} aria-hidden />
              {r.label} <span className="tabular-nums text-muted-foreground">{fmtPct(r.weight)}</span>
            </li>
          ))}
        </ul>
      </div>

      {sectors.length > 0 ? (
        <div className="space-y-2">
          <h4 className="text-sm font-medium">
            Equity sectors <span className="font-normal text-muted-foreground">({fmtPct(equityShare)} of the total)</span>
          </h4>
          <BarList rows={sectors} funds={funds} label="Equity sectors" />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Your portfolio has no equity funds, so there&apos;s no sector breakdown.</p>
      )}

      <div className="space-y-1 text-xs text-muted-foreground">
        <p>Select a bar to see which of your ETFs it comes from.</p>
        <p>
          Sectors are shown for equity funds, grouped into the standard GICS sectors. Bonds, property and gold
          appear in the asset class split.
        </p>
        <AsOfNote data={data} field="sectorsAsOf" funds={funds} />
      </div>
    </section>
  )
}

/** Horizontal bars, one per row, scaled to the largest row. Each row is a button that
 * reveals which ETFs contribute to it. */
function BarList({ rows, funds, label }: { rows: CombinedRow[]; funds: Map<string, FundLabel>; label: string }) {
  const [open, setOpen] = useState<string | null>(null)
  const max = Math.max(...rows.map((r) => r.weight), 0)
  return (
    <ul aria-label={label} className="space-y-1">
      {rows.map((r) => {
        const expanded = open === r.key
        return (
          <li key={r.key}>
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setOpen(expanded ? null : r.key)}
              className="group grid w-full grid-cols-[minmax(7rem,11rem)_1fr_3.5rem_1rem] items-center gap-2 rounded-md px-1 py-1 text-left text-sm hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="truncate" title={r.label}>{r.label}</span>
              <span className="h-3 rounded-r bg-transparent" aria-hidden>
                <span className="block h-full max-w-full rounded-r transition-opacity group-hover:opacity-80"
                      style={{ width: `${max > 0 ? (r.weight / max) * 100 : 0}%`, background: BAR_COLOR, minWidth: r.weight > 0 ? 2 : 0 }} />
              </span>
              <span className="text-right tabular-nums">{fmtPct(r.weight)}</span>
              <ChevronDown className={cn("size-3.5 text-muted-foreground transition-transform", expanded && "rotate-180")} aria-hidden />
            </button>
            {expanded && (
              <ul className="mb-1 ml-1 space-y-0.5 border-l py-1 pl-3 text-xs" aria-label={`${r.label}: contributions by ETF`}>
                {r.contributions.map((c) => {
                  const f = funds.get(c.isin)
                  return (
                    <li key={c.isin} className="flex items-center gap-2">
                      <span className="size-2 shrink-0 rounded-full" style={{ background: f?.color }} aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-muted-foreground">{f?.name ?? c.isin}</span>
                      <span className="tabular-nums">{fmtPct(c.weight)}</span>
                    </li>
                  )
                })}
              </ul>
            )}
          </li>
        )
      })}
    </ul>
  )
}
