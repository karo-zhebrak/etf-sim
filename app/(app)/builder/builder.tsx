"use client"

import { Check } from "lucide-react"
import Link from "next/link"
import { useEffect, useId, useRef, useState, useTransition } from "react"

import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { allocationError, effectiveWeights, exactFractions, isCustomised } from "@/lib/allocation"
import type { EtfOption } from "@/lib/etf-types"
import { formatDateTime, formatMoney } from "@/lib/format"
import {
  CURRENCIES, CURRENCY_LABELS, type Currency, MAX_AMOUNT, MAX_ETFS, MAX_NAME_LENGTH, parseAmount,
} from "@/lib/portfolio-rules"
import { cn } from "@/lib/utils"

import { savePortfolio } from "./actions"
import { AnalysisStep } from "./analysis"
import { useStableColors } from "./series-colors"
import { EtfStep } from "./etf-step"

export type BuilderInitial = {
  id: string | null
  name: string
  amount: number | null
  currency: Currency
  updatedAt: string | null
  etfs: DraftEtf[]
}

type DraftEtf = { isin: string; weight: number | null }
type Draft = { amount: number | null; currency: Currency; etfs: DraftEtf[] }
type Step = "amount" | "etfs" | "analysis"

const STEPS: { id: Step; label: string }[] = [
  { id: "amount", label: "Investment Amount" },
  { id: "etfs", label: "ETF Selection" },
  { id: "analysis", label: "Portfolio Analysis" },
]

const CURRENCY_SYMBOL: Record<Currency, string> = { GBP: "£", EUR: "€", USD: "$" }
const storageKey = (id: string | null) => `etfsim:builder-draft:${id ?? "new"}`
/** A new, unsaved draft lives in localStorage so it survives signing up (the confirmation
 * link opens a new tab); edits to a saved portfolio stay per tab in sessionStorage. */
const draftStore = (id: string | null): Storage => (id === null ? window.localStorage : window.sessionStorage)
const sameDraft = (a: Draft, b: Draft) =>
  a.amount === b.amount && a.currency === b.currency && a.etfs.length === b.etfs.length &&
  a.etfs.every((e, i) => e.isin === b.etfs[i].isin && e.weight === b.etfs[i].weight)
const isEmptyDraft = (d: Draft) => d.amount === null && d.currency === "GBP" && d.etfs.length === 0

function formatAmountInput(amount: number | null): string {
  if (amount === null) return ""
  const pence = Number.isInteger(amount) ? 0 : 2
  return new Intl.NumberFormat("en-GB", { minimumFractionDigits: pence, maximumFractionDigits: 2 }).format(amount)
}

function readStored(id: string | null): { draft: Draft; step: Step } | null {
  try {
    const raw = draftStore(id).getItem(storageKey(id))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    // Drafts stored before ETF selection existed have no etfs list.
    return { step: parsed.step ?? "amount", draft: { etfs: [], ...parsed.draft } }
  } catch {
    return null
  }
}

/** Step-based portfolio builder. Edits a draft in the browser; "Save Portfolio" writes it. */
export function Builder({ initial, etfOptions, signedIn }: {
  initial: BuilderInitial
  etfOptions: EtfOption[]
  /** Visitors can build and analyse; saving asks them to sign in first. */
  signedIn: boolean
}) {
  const [id, setId] = useState(initial.id)
  const [name, setName] = useState(initial.name)
  const [savedAt, setSavedAt] = useState(initial.updatedAt)
  const [initialDraft] = useState<Draft>(() => ({ amount: initial.amount, currency: initial.currency, etfs: initial.etfs }))
  const [saved, setSaved] = useState<Draft>(initialDraft)
  const [draft, setDraft] = useState<Draft>(saved)
  const [amountText, setAmountText] = useState(formatAmountInput(initial.amount))
  const [step, setStep] = useState<Step>("amount")
  const [restored, setRestored] = useState(false)
  const [saveOpen, setSaveOpen] = useState(false)
  const [signInOpen, setSignInOpen] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)
  const [allocationNotice, setAllocationNotice] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const hydrated = useRef(false)

  const parsed = parseAmount(amountText)
  const amountError =
    Number.isNaN(parsed) ? "Enter a number, for example 10,000 or 2,500.50."
    : parsed !== null && parsed <= 0 ? "The amount must be greater than zero."
    : parsed !== null && parsed > MAX_AMOUNT ? `The amount must be no more than ${formatMoney(MAX_AMOUNT, draft.currency)}.`
    : null
  const dirty = id === null || !sameDraft(draft, saved)
  const allocError = allocationError(draft.etfs)
  const analysisReady = draft.etfs.length > 0 && allocError === null
  const fundColors = useStableColors(draft.etfs.map((e) => e.isin))

  // Restore unsaved changes from this browser tab (e.g. after a reload). Runs once after
  // hydration, because session storage doesn't exist during server rendering.
  useEffect(() => {
    const stored = readStored(initial.id)
    hydrated.current = true
    if (stored && !sameDraft(stored.draft, initialDraft)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore after hydration
      setDraft(stored.draft)
      setAmountText(formatAmountInput(stored.draft.amount))
      setStep(stored.step)
      setRestored(true)
    }
  }, [initial.id, initialDraft])

  // Keep the draft in session storage while it has unsaved changes.
  useEffect(() => {
    if (!hydrated.current) return
    try {
      if (dirty && !(id === null && isEmptyDraft(draft))) {
        draftStore(id).setItem(storageKey(id), JSON.stringify({ draft, step }))
      } else {
        draftStore(id).removeItem(storageKey(id))
      }
    } catch {
      // Storage unavailable (private mode): the draft still lives in memory.
    }
  }, [draft, step, dirty, id])

  // Warn before leaving with unsaved changes: closing or reloading the tab (browser prompt),
  // or following a link elsewhere in the app. Links are caught in the capture phase, before
  // Next.js handles them, and a cancelled click never navigates. (The draft is also kept in
  // session storage, so even an accepted navigation can be undone by coming back.)
  useEffect(() => {
    const hasChanges = id === null ? !isEmptyDraft(draft) : !sameDraft(draft, saved)
    if (!hasChanges) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault()
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const link = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return
      if (link.closest("[data-keeps-draft]")) return // the draft is stored and restored afterwards
      const url = new URL(link.href, window.location.href)
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return
      if (!window.confirm("You have unsaved changes to this portfolio. Leave without saving?")) {
        e.preventDefault()
        e.stopPropagation()
      }
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    document.addEventListener("click", onClick, true)
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload)
      document.removeEventListener("click", onClick, true)
    }
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
    setDraft(initialDraft)
    setAmountText(formatAmountInput(initialDraft.amount))
    setRestored(false)
  }

  // Changing the selection after customising weights would leave a total other than 100%,
  // so the allocation goes back to equal weights (with a notice).
  function changeSelection(next: (etfs: DraftEtf[]) => DraftEtf[]) {
    setJustSaved(false)
    const customised = isCustomised(draft.etfs)
    const etfs = next(draft.etfs)
    if (etfs === draft.etfs) return
    setDraft({ ...draft, etfs: customised ? etfs.map((e) => ({ ...e, weight: null })) : etfs })
    setAllocationNotice(customised && etfs.length > 0
      ? "Your selection changed, so the allocation was reset to equal weights." : null)
  }

  function addEtf(isin: string) {
    changeSelection((etfs) => (etfs.length >= MAX_ETFS || etfs.some((e) => e.isin === isin)
      ? etfs : [...etfs, { isin, weight: null }]))
  }

  function removeEtf(isin: string) {
    changeSelection((etfs) => etfs.filter((e) => e.isin !== isin))
  }

  /** Set one fund's weight. The first edit fixes the others at their current (equal) values. */
  function setWeight(isin: string, weight: number) {
    setJustSaved(false)
    setAllocationNotice(null)
    setDraft((d) => {
      const current = effectiveWeights(d.etfs)
      return { ...d, etfs: d.etfs.map((e, i) => ({ ...e, weight: e.isin === isin ? weight : current[i] })) }
    })
  }

  function splitEqually() {
    setJustSaved(false)
    setAllocationNotice(null)
    setDraft((d) => ({ ...d, etfs: d.etfs.map((e) => ({ ...e, weight: null })) }))
  }

  function save(nameToSave: string) {
    if (amountError) {
      setStep("amount")
      setSaveError("Fix the investment amount before saving.")
      return
    }
    setSaveError(null)
    startTransition(async () => {
      const result = await savePortfolio({
        id, name: nameToSave, amount: draft.amount, currency: draft.currency, etfs: draft.etfs,
      })
      if (!result.ok) {
        if (result.needsSignIn) {
          setSaveOpen(false)
          setSignInOpen(true)
          return
        }
        setSaveError(result.error)
        return
      }
      try {
        draftStore(id).removeItem(storageKey(id))
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
          <Button onClick={() => (!signedIn ? setSignInOpen(true) : id === null ? setSaveOpen(true) : save(name))} disabled={pending}>
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

      <Stepper step={step} onStep={setStep} analysisEnabled={analysisReady} />

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
        <EtfStep
          options={etfOptions}
          selected={draft.etfs.map((e) => e.isin)}
          weights={effectiveWeights(draft.etfs)}
          customised={isCustomised(draft.etfs)}
          amount={draft.amount}
          currency={draft.currency}
          allocationError={allocError}
          allocationNotice={allocationNotice}
          onAdd={addEtf}
          onRemove={removeEtf}
          onWeightChange={setWeight}
          onSplitEqually={splitEqually}
          onBack={() => setStep("amount")}
          onContinue={() => setStep("analysis")}
        />
      )}
      {step === "analysis" && (analysisReady ? (
        <AnalysisStep
          isins={draft.etfs.map((e) => e.isin)}
          fractions={exactFractions(draft.etfs)}
          amount={draft.amount}
          colors={fundColors}
          etfOptions={etfOptions}
          currency={draft.currency}
          onBack={() => setStep("etfs")}
        />
      ) : (
        <ComingSoon title="Portfolio Analysis"
                    text={draft.etfs.length === 0 ? "Select at least one ETF to see the analysis." : "Make the allocations add up to 100% to see the analysis."}
                    backLabel="Back to ETF selection" onBack={() => setStep("etfs")} />
      ))}

      <SaveDialog open={saveOpen} onOpenChange={setSaveOpen} pending={pending} error={saveError} onSave={save} />
      {/* Next.js keeps this page alive across the sign-in round trip, so the prompt must
          close itself and never show once the user is signed in. */}
      <SignInToSaveDialog open={signInOpen && !signedIn} onOpenChange={setSignInOpen} />
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
                title={disabled ? "Select at least one ETF, with allocations adding up to 100%" : undefined}
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

function ComingSoon({ title, text, backLabel, onBack }: { title: string; text: string; backLabel: string; onBack: () => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{text}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="outline" onClick={onBack}>{backLabel}</Button>
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

/** Saving needs an account. The draft stays in this browser, so signing in (or confirming a
 * new account by email) brings the user back to /builder with their choices restored. */
function SignInToSaveDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-keeps-draft>
        <DialogHeader>
          <DialogTitle>Sign in to save your portfolio</DialogTitle>
          <DialogDescription>
            Saving needs a free account, so you can come back to your portfolios later. Your choices are kept in this
            browser and will be here when you return.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Link href="/login?next=/builder" onClick={() => onOpenChange(false)} className={buttonVariants({ variant: "outline" })}>
            Sign in
          </Link>
          <Link href="/signup?next=/builder" onClick={() => onOpenChange(false)} className={buttonVariants()}>
            Create a free account
          </Link>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
