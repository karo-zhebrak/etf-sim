"use client"

import { Check, Plus, Search, X } from "lucide-react"
import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { parseWeight, totalWeight } from "@/lib/allocation"
import { ASSET_CLASS_LABELS, type EtfOption, matchesQuery } from "@/lib/etf-types"
import { formatMoney } from "@/lib/format"
import { type Currency, MAX_ETFS } from "@/lib/portfolio-rules"
import { cn } from "@/lib/utils"

import { EtfDetailSheet } from "./etf-detail"

const terFmt = new Intl.NumberFormat("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const weightFmt = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2, useGrouping: false })

/** Percentage field that keeps what the user is typing, and follows outside changes
 * (e.g. "Split equally") while it isn't being edited. */
function WeightInput({ value, label, onCommit }: { value: number; label: string; onCommit: (w: number) => void }) {
  const [text, setText] = useState(weightFmt.format(value))
  const [prev, setPrev] = useState(value)
  const [focused, setFocused] = useState(false)
  if (value !== prev) {
    setPrev(value)
    if (!focused) setText(weightFmt.format(value))
  }
  const parsed = parseWeight(text)
  const invalid = parsed === null || Number.isNaN(parsed)
  return (
    <div className="relative w-24">
      <Input
        inputMode="decimal"
        aria-label={`Allocation for ${label} (%)`}
        aria-invalid={invalid || undefined}
        value={text}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false)
          if (!invalid) setText(weightFmt.format(parsed))
        }}
        onChange={(e) => {
          setText(e.target.value)
          const w = parseWeight(e.target.value)
          if (w !== null && !Number.isNaN(w)) onCommit(w)
        }}
        className="h-8 pr-7 text-right tabular-nums"
      />
      <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-sm text-muted-foreground" aria-hidden>%</span>
    </div>
  )
}

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
export function EtfStep({
  options, selected, weights, customised, amount, currency, allocationError, allocationNotice,
  onAdd, onRemove, onWeightChange, onSplitEqually, onBack, onContinue,
}: {
  options: EtfOption[]
  selected: string[]
  /** Effective weights in percent, aligned with `selected`. */
  weights: number[]
  customised: boolean
  amount: number | null
  currency: Currency
  allocationError: string | null
  allocationNotice: string | null
  onAdd: (isin: string) => void
  onRemove: (isin: string) => void
  onWeightChange: (isin: string, weight: number) => void
  onSplitEqually: () => void
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
    <div className="grid gap-6 lg:grid-cols-[1fr_26rem]">
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
            {selected.length === 0
              ? "Nothing selected yet."
              : customised ? "Custom allocation. Percentages must add up to 100%." : "Split equally. Change any percentage to customise."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {selected.length > 0 && (
            <ol aria-label="Selected ETFs" className="space-y-2">
              {selected.map((isin) => {
                const etf = byIsin.get(isin)
                const label = etf?.name ?? isin
                const weight = weights[selected.indexOf(isin)] ?? 0
                return (
                  <li key={isin} className="space-y-2 rounded-lg border p-2">
                    <div className="flex items-start gap-2">
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
                    </div>
                    <div className="flex items-center justify-between gap-3 pl-0.5">
                      <WeightInput value={weight} label={label} onCommit={(w) => onWeightChange(isin, w)} />
                      <span className="text-sm tabular-nums" data-testid={`amount-${isin}`}>
                        {amount === null ? "—" : formatMoney(Math.round(amount * weight) / 100, currency)}
                      </span>
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
          {selected.length > 0 && (
            <div className="space-y-2 border-t pt-3">
              <div className="flex items-center justify-between text-sm font-medium">
                <span>Total</span>
                <span className="flex gap-6 tabular-nums">
                  <span data-testid="allocation-total" className={cn(allocationError && "text-destructive")}>
                    {weightFmt.format(totalWeight(weights))}%
                  </span>
                  <span>{amount === null ? "—" : formatMoney(amount, currency)}</span>
                </span>
              </div>
              {amount === null && (
                <p className="text-xs text-muted-foreground">Enter an investment amount in step 1 to see the amount for each fund.</p>
              )}
              {allocationError && <p role="alert" className="text-sm text-destructive">{allocationError}</p>}
              {allocationNotice && <p role="status" className="text-sm text-muted-foreground">{allocationNotice}</p>}
              {customised && (
                <Button variant="outline" size="sm" onClick={onSplitEqually}>Split equally</Button>
              )}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={onBack}>Back</Button>
            <Button onClick={onContinue} disabled={selected.length === 0 || allocationError !== null}
                    title={selected.length === 0 ? "Select at least one ETF" : allocationError ?? undefined}>
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
