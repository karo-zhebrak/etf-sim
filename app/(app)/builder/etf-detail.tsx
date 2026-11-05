"use client"

import { Check, ExternalLink, Plus } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { DISTRIBUTION_LABELS, type EtfDetail, type EtfOption, REPLICATION_LABELS } from "@/lib/etf-types"
import { MAX_ETFS } from "@/lib/portfolio-rules"

import { loadEtfDetail } from "./actions"

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
const pctFmt = new Intl.NumberFormat("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const formatDate = (iso: string | null) => (iso ? dateFmt.format(new Date(`${iso}T00:00:00Z`)) : "—")

type LoadState = { status: "loading" } | { status: "error" } | { status: "ready"; detail: EtfDetail }

/** Side panel with an ETF's details (spec 3.3 B). Loads data when opened; keeps loaded
 * funds in memory so reopening is instant. */
export function EtfDetailSheet({ etf, onClose, selected, selectedCount, onAdd, onRemove }: {
  etf: EtfOption | null
  onClose: () => void
  selected: boolean
  selectedCount: number
  onAdd: (isin: string) => void
  onRemove: (isin: string) => void
}) {
  const cache = useRef(new Map<string, EtfDetail>())
  const [state, setState] = useState<LoadState>({ status: "loading" })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!etf) return
    const cached = cache.current.get(etf.isin)
    let cancelled = false
    setState(cached ? { status: "ready", detail: cached } : { status: "loading" })
    if (cached) return
    loadEtfDetail(etf.isin)
      .then((detail) => {
        if (cancelled) return
        if (!detail) return setState({ status: "error" })
        cache.current.set(etf.isin, detail)
        setState({ status: "ready", detail })
      })
      .catch(() => !cancelled && setState({ status: "error" }))
    return () => {
      cancelled = true
    }
  }, [etf, attempt])

  const full = selectedCount >= MAX_ETFS
  return (
    <Sheet open={etf !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="gap-0 overflow-y-auto p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-xl">
        {etf && (
          <>
            <SheetHeader className="space-y-2 border-b p-5 pr-12">
              <SheetTitle className="text-lg leading-snug">{etf.name}</SheetTitle>
              <SheetDescription className="font-mono text-xs">{etf.isin}{etf.ticker ? ` · ${etf.ticker}` : ""}</SheetDescription>
              <div className="pt-1">
                {selected ? (
                  <Button variant="secondary" size="sm" onClick={() => onRemove(etf.isin)}>
                    <Check aria-hidden /> In your portfolio · Remove
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => onAdd(etf.isin)} disabled={full}>
                    <Plus aria-hidden /> Add to portfolio
                  </Button>
                )}
                {!selected && full && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    You&apos;ve selected {MAX_ETFS} ETFs. Remove one to add this fund.
                  </p>
                )}
              </div>
            </SheetHeader>

            <div className="space-y-6 p-5">
              {state.status === "loading" && <DetailSkeleton />}
              {state.status === "error" && (
                <div className="space-y-2 text-sm">
                  <p role="alert" className="text-destructive">We couldn&apos;t load this fund&apos;s details.</p>
                  <Button variant="outline" size="sm" onClick={() => setAttempt((a) => a + 1)}>Try again</Button>
                </div>
              )}
              {state.status === "ready" && <DetailBody detail={state.detail} />}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

function DetailBody({ detail }: { detail: EtfDetail }) {
  const facts: [string, string][] = [
    ["Benchmark", detail.benchmark ?? "—"],
    ["Distribution policy", detail.distribution ? DISTRIBUTION_LABELS[detail.distribution] : "—"],
    ["Replication method", detail.replication ? REPLICATION_LABELS[detail.replication] : "—"],
    ["Currency", detail.currency ?? "—"],
    ["Inception date", formatDate(detail.inceptionDate)],
    ["TER (ongoing charge)", detail.ter === null ? "—" : `${pctFmt.format(detail.ter)}% a year`],
  ]
  return (
    <>
      <section aria-labelledby="facts-heading" className="space-y-3">
        <h3 id="facts-heading" className="text-sm font-semibold">Key facts</h3>
        <dl className="divide-y rounded-lg border text-sm">
          {facts.map(([label, value]) => (
            <div key={label} className="grid grid-cols-[10rem_1fr] gap-3 px-3 py-2">
              <dt className="text-muted-foreground">{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {detail.description && (
        <section aria-labelledby="desc-heading" className="space-y-2">
          <h3 id="desc-heading" className="text-sm font-semibold">Description</h3>
          <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{detail.description}</p>
        </section>
      )}

      <section aria-labelledby="holdings-heading" className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <h3 id="holdings-heading" className="text-sm font-semibold">Top 10 constituents</h3>
          {detail.holdingsAsOf && <span className="text-xs text-muted-foreground">As of {formatDate(detail.holdingsAsOf)}</span>}
        </div>
        {detail.assetClass === "commodity" ? (
          <p className="rounded-lg border p-3 text-sm text-muted-foreground">
            This fund holds <span className="font-medium text-foreground">physical gold</span> stored in a vault,
            rather than shares or bonds, so it has no list of constituents.
          </p>
        ) : detail.topHoldings.length === 0 ? (
          <p className="text-sm text-muted-foreground">No holdings data is available for this fund.</p>
        ) : (
          <table className="w-full text-sm">
            <caption className="sr-only">Ten largest holdings and their weights</caption>
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th scope="col" className="w-8 py-1.5 font-normal">#</th>
                <th scope="col" className="py-1.5 font-normal">Holding</th>
                <th scope="col" className="py-1.5 text-right font-normal">Weight</th>
              </tr>
            </thead>
            <tbody>
              {detail.topHoldings.map((h, i) => (
                <tr key={`${h.name}-${h.isin ?? i}`} className="border-b last:border-0">
                  <td className="py-1.5 text-muted-foreground tabular-nums">{i + 1}</td>
                  <td className="py-1.5">
                    {h.name}
                    {h.isin && <span className="ml-2 font-mono text-xs text-muted-foreground">{h.isin}</span>}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">{pctFmt.format(h.weight)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="text-xs text-muted-foreground">
          Holdings as published by the fund issuer. Cash, currency hedges and futures are left out.
        </p>
      </section>

      {detail.factsheetUrl && (
        <a href={detail.factsheetUrl} target="_blank" rel="noopener noreferrer"
           className="inline-flex items-center gap-1 text-sm underline-offset-4 hover:underline">
          Issuer factsheet <ExternalLink className="size-3.5" aria-hidden />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      )}
    </>
  )
}

function DetailSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading fund details">
      {Array.from({ length: 6 }, (_, i) => <div key={i} className="h-8 animate-pulse rounded bg-muted" />)}
      <div className="h-24 animate-pulse rounded bg-muted" />
    </div>
  )
}
