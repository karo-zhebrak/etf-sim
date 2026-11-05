"use client"

import { Check, Plus, Search, X } from "lucide-react"
import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ASSET_CLASS_LABELS, type EtfOption, matchesQuery } from "@/lib/etf-types"
import { MAX_ETFS } from "@/lib/portfolio-rules"
import { cn } from "@/lib/utils"

import { EtfDetailSheet } from "./etf-detail"

const terFmt = new Intl.NumberFormat("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function EtfMeta({ etf }: { etf: EtfOption }) {
  return (
    <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
      <span className="font-mono">{etf.isin}</span>
      {etf.ticker && <span>{etf.ticker}</span>}
      {etf.assetClass && <span>{ASSET_CLASS_LABELS[etf.assetClass]}</span>}
      {etf.ter !== null && <span>TER {terFmt.format(etf.ter)}%</span>}
    </p>
  )
}

/** Step 2: search the ETF list and select up to MAX_ETFS funds. */
export function EtfStep({ options, selected, onAdd, onRemove, onBack, onContinue }: {
  options: EtfOption[]
  selected: string[]
  onAdd: (isin: string) => void
  onRemove: (isin: string) => void
  onBack: () => void
  onContinue: () => void
}) {
  const [query, setQuery] = useState("")
  const [announcement, setAnnouncement] = useState("")
  const [detailIsin, setDetailIsin] = useState<string | null>(null)
  const byIsin = useMemo(() => new Map(options.map((o) => [o.isin, o])), [options])
  const results = useMemo(() => options.filter((o) => matchesQuery(o, query)), [options, query])
  const full = selected.length >= MAX_ETFS

  const detailEtf = detailIsin ? byIsin.get(detailIsin) ?? null : null

  function add(etf: EtfOption) {
    if (full) return
    onAdd(etf.isin)
    setAnnouncement(`Added ${etf.name}. ${selected.length + 1} of ${MAX_ETFS} selected.`)
  }
  function remove(etf: EtfOption) {
    onRemove(etf.isin)
    setAnnouncement(`Removed ${etf.name}. ${selected.length - 1} of ${MAX_ETFS} selected.`)
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <p role="status" aria-live="polite" className="sr-only">{announcement}</p>

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>Choose your ETFs</CardTitle>
          <CardDescription>
            Search by name, ISIN or ticker, and select a fund&apos;s name to see its details. You can select up to {MAX_ETFS}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              type="search"
              aria-label="Search ETFs"
              placeholder="e.g. MSCI World, IE00B4L5Y983, CSPX"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          {full && (
            <p className="rounded-lg bg-muted px-3 py-2 text-sm">
              You&apos;ve selected the maximum of {MAX_ETFS} ETFs. Remove one to add another.
            </p>
          )}
          {results.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No ETFs match “{query}”.</p>
          ) : (
            <ul aria-label="ETF search results" className="divide-y rounded-lg border">
              {results.map((etf) => {
                const isSelected = selected.includes(etf.isin)
                return (
                  <li key={etf.isin} className="flex items-center gap-3 p-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      <button type="button" onClick={() => setDetailIsin(etf.isin)}
                              className="text-left text-sm font-medium underline-offset-4 hover:underline"
                              aria-label={`${etf.name}: view details`}>
                        {etf.name}
                      </button>
                      <EtfMeta etf={etf} />
                    </div>
                    {isSelected ? (
                      <Button variant="secondary" size="sm" onClick={() => remove(etf)} aria-label={`Remove ${etf.name}`}>
                        <Check aria-hidden /> Added
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => add(etf)} disabled={full}
                              aria-label={`Add ${etf.name}`} title={full ? `You can select up to ${MAX_ETFS} ETFs` : undefined}>
                        <Plus aria-hidden /> Add
                      </Button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="order-first h-fit lg:order-none lg:sticky lg:top-20">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Selected ETFs
            <span
              data-testid="selected-count"
              className={cn("rounded-full px-2 py-0.5 text-xs font-medium", full ? "bg-foreground text-background" : "bg-muted")}
            >
              {selected.length}/{MAX_ETFS}
            </span>
          </CardTitle>
          <CardDescription>
            {selected.length === 0 ? "Nothing selected yet." : "Your portfolio will be split across these funds."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {selected.length > 0 && (
            <ol aria-label="Selected ETFs" className="space-y-2">
              {selected.map((isin) => {
                const etf = byIsin.get(isin)
                const label = etf?.name ?? isin
                return (
                  <li key={isin} className="flex items-start gap-2 rounded-lg border p-2">
                    <div className="min-w-0 flex-1">
                      {etf ? (
                        <button type="button" onClick={() => setDetailIsin(isin)}
                                className="text-left text-sm font-medium leading-snug underline-offset-4 hover:underline"
                                aria-label={`${label}: view details`}>
                          {label}
                        </button>
                      ) : (
                        <p className="text-sm font-medium leading-snug">{label}</p>
                      )}
                      <p className="font-mono text-xs text-muted-foreground">{isin}</p>
                    </div>
                    <Button variant="ghost" size="icon-sm" aria-label={`Remove ${label}`}
                            onClick={() => (etf ? remove(etf) : onRemove(isin))}>
                      <X aria-hidden />
                    </Button>
                  </li>
                )
              })}
            </ol>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={onBack}>Back</Button>
            <Button onClick={onContinue} disabled={selected.length === 0}
                    title={selected.length === 0 ? "Select at least one ETF" : undefined}>
              Continue to analysis
            </Button>
          </div>
        </CardContent>
      </Card>

      <EtfDetailSheet
        etf={detailEtf}
        onClose={() => setDetailIsin(null)}
        selected={detailIsin !== null && selected.includes(detailIsin)}
        selectedCount={selected.length}
        onAdd={() => detailEtf && add(detailEtf)}
        onRemove={() => detailEtf && remove(detailEtf)}
      />
    </div>
  )
}
