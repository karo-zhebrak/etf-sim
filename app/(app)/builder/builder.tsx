"use client"

import { Check } from "lucide-react"
import { useEffect, useId, useRef, useState, useTransition } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { formatDateTime, formatMoney } from "@/lib/format"
import {
  CURRENCIES, CURRENCY_LABELS, type Currency, MAX_AMOUNT, MAX_NAME_LENGTH, parseAmount,
} from "@/lib/portfolio-rules"
import { cn } from "@/lib/utils"

import { savePortfolio } from "./actions"

export type BuilderInitial = {
  id: string | null
  name: string
  amount: number | null
  currency: Currency
  updatedAt: string | null
}

type Draft = { amount: number | null; currency: Currency }
type Step = "amount" | "etfs" | "analysis"

const STEPS: { id: Step; label: string }[] = [
  { id: "amount", label: "Investment Amount" },
  { id: "etfs", label: "ETF Selection" },
  { id: "analysis", label: "Portfolio Analysis" },
]

const CURRENCY_SYMBOL: Record<Currency, string> = { GBP: "£", EUR: "€", USD: "$" }
const storageKey = (id: string | null) => `etfsim:builder-draft:${id ?? "new"}`
const sameDraft = (a: Draft, b: Draft) => a.amount === b.amount && a.currency === b.currency

function formatAmountInput(amount: number | null): string {
  if (amount === null) return ""
  const pence = Number.isInteger(amount) ? 0 : 2
  return new Intl.NumberFormat("en-GB", { minimumFractionDigits: pence, maximumFractionDigits: 2 }).format(amount)
}

function readStored(id: string | null): { draft: Draft; step: Step } | null {
  try {
    const raw = window.sessionStorage.getItem(storageKey(id))
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

/** Step-based portfolio builder. Edits a draft in the browser; "Save Portfolio" writes it. */
export function Builder({ initial }: { initial: BuilderInitial }) {
  const [id, setId] = useState(initial.id)
  const [name, setName] = useState(initial.name)
  const [savedAt, setSavedAt] = useState(initial.updatedAt)
  const [saved, setSaved] = useState<Draft>({ amount: initial.amount, currency: initial.currency })
  const [draft, setDraft] = useState<Draft>(saved)
  const [amountText, setAmountText] = useState(formatAmountInput(initial.amount))
  const [step, setStep] = useState<Step>("amount")
  const [restored, setRestored] = useState(false)
  const [saveOpen, setSaveOpen] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)
  const [pending, startTransition] = useTransition()
  const hydrated = useRef(false)

  const parsed = parseAmount(amountText)
  const amountError =
    Number.isNaN(parsed) ? "Enter a number, for example 10,000 or 2,500.50."
    : parsed !== null && parsed <= 0 ? "The amount must be greater than zero."
    : parsed !== null && parsed > MAX_AMOUNT ? `The amount must be no more than ${formatMoney(MAX_AMOUNT, draft.currency)}.`
    : null
  const dirty = id === null || !sameDraft(draft, saved)

  // Restore unsaved changes from this browser tab (e.g. after a reload). Runs once after
  // hydration, because session storage doesn't exist during server rendering.
  useEffect(() => {
    const stored = readStored(initial.id)
    hydrated.current = true
    if (stored && !sameDraft(stored.draft, { amount: initial.amount, currency: initial.currency })) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore after hydration
      setDraft(stored.draft)
      setAmountText(formatAmountInput(stored.draft.amount))
      setStep(stored.step)
      setRestored(true)
    }
  }, [initial.id, initial.amount, initial.currency])

  // Keep the draft in session storage while it has unsaved changes.
  useEffect(() => {
    if (!hydrated.current) return
    try {
      if (dirty && !(id === null && draft.amount === null && draft.currency === "GBP")) {
        window.sessionStorage.setItem(storageKey(id), JSON.stringify({ draft, step }))
      } else {
        window.sessionStorage.removeItem(storageKey(id))
      }
    } catch {
      // Storage unavailable (private mode): the draft still lives in memory.
    }
  }, [draft, step, dirty, id])

  // Warn before closing or reloading the tab with unsaved changes.
  useEffect(() => {
    const hasChanges = id === null ? draft.amount !== null : !sameDraft(draft, saved)
    if (!hasChanges) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [draft, saved, id])

  function updateAmountText(text: string) {
    setAmountText(text)
    setJustSaved(false)
    const value = parseAmount(text)
    if (value === null || (Number.isFinite(value) && value > 0 && value <= MAX_AMOUNT)) {
      setDraft((d) => ({ ...d, amount: value }))
    }
  }

  function updateCurrency(currency: Currency) {
    setJustSaved(false)
    setDraft((d) => ({ ...d, currency }))
  }

  function discardRestored() {
    const original = { amount: initial.amount, currency: initial.currency }
    setDraft(original)
    setAmountText(formatAmountInput(original.amount))
    setRestored(false)
  }

  function save(nameToSave: string) {
    if (amountError) {
      setStep("amount")
      setSaveError("Fix the investment amount before saving.")
      return
    }
    setSaveError(null)
    startTransition(async () => {
      const result = await savePortfolio({ id, name: nameToSave, amount: draft.amount, currency: draft.currency })
      if (!result.ok) {
        setSaveError(result.error)
        return
      }
      try {
        window.sessionStorage.removeItem(storageKey(id))
      } catch {}
      if (id === null) {
        // Give the new portfolio its permanent URL without remounting the builder.
        window.history.replaceState(null, "", `/builder/${result.id}`)
      }
      setId(result.id)
      setName(result.name)
      setSaved(draft)
      setSavedAt(result.updatedAt)
      setRestored(false)
      setSaveOpen(false)
      setJustSaved(true)
    })
  }

  const amountSummary = draft.amount === null ? `No amount yet (${draft.currency})` : formatMoney(draft.amount, draft.currency)

  return (
    <div className="space-y-6">
      {/* Header: name, amount summary (shown on every step) and Save. */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{name || "New portfolio"}</h1>
          <p className="text-sm text-muted-foreground">
            Investment: <span className="font-medium text-foreground" data-testid="amount-summary">{amountSummary}</span>
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Button onClick={() => (id === null ? setSaveOpen(true) : save(name))} disabled={pending}>
            {pending ? "Saving…" : "Save Portfolio"}
          </Button>
          <p role="status" className="text-xs text-muted-foreground">
            {justSaved ? (
              <span className="inline-flex items-center gap-1 text-foreground"><Check className="size-3.5" aria-hidden /> Portfolio saved</span>
            ) : dirty && id !== null ? "Unsaved changes"
              : savedAt ? `Last saved ${formatDateTime(savedAt)}` : "Not saved yet"}
          </p>
        </div>
      </div>
      {saveError && !saveOpen && <p role="alert" className="text-sm text-destructive">{saveError}</p>}
      {restored && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/40 px-4 py-2 text-sm">
          <span>We restored the unsaved changes you made earlier.</span>
          <Button variant="ghost" size="sm" onClick={discardRestored}>Discard them</Button>
        </div>
      )}

      <Stepper step={step} onStep={setStep} analysisEnabled={false} />

      {step === "amount" && (
        <AmountStep
          amountText={amountText}
          currency={draft.currency}
          error={amountError}
          onAmountChange={updateAmountText}
          onAmountBlur={() => !amountError && setAmountText(formatAmountInput(parseAmount(amountText)))}
          onCurrencyChange={updateCurrency}
          onContinue={() => setStep("etfs")}
        />
      )}
      {step === "etfs" && (
        <ComingSoon title="ETF Selection" text="Searching and selecting up to five ETFs arrives in the next iteration." onBack={() => setStep("amount")} />
      )}

      <SaveDialog open={saveOpen} onOpenChange={setSaveOpen} pending={pending} error={saveError} onSave={save} />
    </div>
  )
}

function Stepper({ step, onStep, analysisEnabled }: { step: Step; onStep: (s: Step) => void; analysisEnabled: boolean }) {
  const current = STEPS.findIndex((s) => s.id === step)
  return (
    <nav aria-label="Portfolio builder steps">
      <ol className="grid grid-cols-3 gap-2">
        {STEPS.map((s, i) => {
          const disabled = s.id === "analysis" && !analysisEnabled
          const active = s.id === step
          return (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => onStep(s.id)}
                disabled={disabled}
                aria-current={active ? "step" : undefined}
                title={disabled ? "Select at least one ETF to see the analysis" : undefined}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                  active ? "border-foreground bg-foreground text-background" : "hover:bg-muted",
                  disabled && "cursor-not-allowed opacity-50 hover:bg-transparent",
                )}
              >
                <span className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium",
                  active ? "border-background" : i < current ? "border-foreground" : "",
                )}>
                  {i + 1}
                </span>
                <span className="hidden truncate sm:inline">{s.label}</span>
                <span className="sr-only sm:hidden">{s.label}</span>
              </button>
            </li>
          )
        })}
      </ol>
      <p className="mt-2 text-sm text-muted-foreground sm:hidden" aria-hidden>
        Step {current + 1} of {STEPS.length}: {STEPS[current].label}
      </p>
    </nav>
  )
}

function AmountStep(props: {
  amountText: string
  currency: Currency
  error: string | null
  onAmountChange: (v: string) => void
  onAmountBlur: () => void
  onCurrencyChange: (c: Currency) => void
  onContinue: () => void
}) {
  const { amountText, currency, error } = props
  const groupId = useId()
  return (
    <Card>
      <CardHeader>
        <CardTitle>How much do you want to invest?</CardTitle>
        <CardDescription>
          This is a simulation: no real money is involved. You can change the amount at any time.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium" id={groupId}>Currency</legend>
          <div role="radiogroup" aria-labelledby={groupId} className="inline-flex rounded-lg border p-1">
            {CURRENCIES.map((c) => (
              <label
                key={c}
                className={cn(
                  "cursor-pointer rounded-md px-4 py-1.5 text-sm transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ring",
                  c === currency ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <input
                  type="radio"
                  name="currency"
                  value={c}
                  checked={c === currency}
                  onChange={() => props.onCurrencyChange(c)}
                  className="sr-only"
                  aria-label={CURRENCY_LABELS[c]}
                />
                {c}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="max-w-xs space-y-2">
          <Label htmlFor="amount">Investment amount</Label>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground" aria-hidden>
              {CURRENCY_SYMBOL[currency]}
            </span>
            <Input
              id="amount"
              inputMode="decimal"
              autoComplete="off"
              placeholder="10,000"
              value={amountText}
              onChange={(e) => props.onAmountChange(e.target.value)}
              onBlur={props.onAmountBlur}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "amount-error" : "amount-hint"}
              className="pl-7 text-base"
            />
          </div>
          {error ? (
            <p id="amount-error" role="alert" className="text-sm text-destructive">{error}</p>
          ) : (
            <p id="amount-hint" className="text-xs text-muted-foreground">In {CURRENCY_LABELS[currency]}.</p>
          )}
        </div>

        <Button onClick={props.onContinue} disabled={Boolean(error)}>Continue to ETF selection</Button>
      </CardContent>
    </Card>
  )
}

function ComingSoon({ title, text, onBack }: { title: string; text: string; onBack: () => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{text}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="outline" onClick={onBack}>Back to investment amount</Button>
      </CardContent>
    </Card>
  )
}

function SaveDialog({ open, onOpenChange, pending, error, onSave }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  pending: boolean
  error: string | null
  onSave: (name: string) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            onSave(String(new FormData(e.currentTarget).get("name") ?? ""))
          }}
        >
          <DialogHeader>
            <DialogTitle>Save portfolio</DialogTitle>
            <DialogDescription>Name your portfolio so you can find it in My Portfolios.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="save-name">Portfolio name</Label>
            <Input id="save-name" name="name" required maxLength={MAX_NAME_LENGTH} autoComplete="off"
                   placeholder="e.g. Long-term global mix" autoFocus />
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
