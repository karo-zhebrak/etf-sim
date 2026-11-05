import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"

import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { formatDateTime, formatMoney } from "@/lib/format"
import { listPortfolios } from "@/lib/portfolios"

import { DeletePortfolioDialog, NewPortfolioDialog, RenamePortfolioDialog } from "./dialogs"

export const metadata: Metadata = { title: "My Portfolios" }

export default function PortfoliosPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">My Portfolios</h1>
          <p className="text-sm text-muted-foreground">Your saved portfolios, most recently changed first.</p>
        </div>
        <NewPortfolioDialog />
      </div>
      <Suspense fallback={<Card className="h-40" />}>
        <PortfolioList />
      </Suspense>
    </div>
  )
}

async function PortfolioList() {
  const portfolios = await listPortfolios()

  if (portfolios.length === 0) {
    return (
      <Card>
        <CardContent className="space-y-2 py-10 text-center">
          <p className="font-medium">No portfolios yet</p>
          <p className="text-sm text-muted-foreground">Create one to start choosing ETFs. It will be saved here.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <ul className="divide-y rounded-xl border bg-card" aria-label="Saved portfolios">
      {portfolios.map((p) => (
        <li key={p.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1 space-y-1">
            <Link href={`/builder/${p.id}`} className="block truncate font-medium hover:underline">
              {p.name}
            </Link>
            <dl className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <div className="flex gap-1">
                <dt className="sr-only">ETFs</dt>
                <dd>{p.etfCount} {p.etfCount === 1 ? "ETF" : "ETFs"}</dd>
              </div>
              <div className="flex gap-1">
                <dt className="sr-only">Investment amount</dt>
                <dd>{p.amount === null ? `No amount yet (${p.currency})` : formatMoney(p.amount, p.currency)}</dd>
              </div>
              <div className="flex gap-1">
                <dt>Last modified</dt>
                <dd><time dateTime={p.updatedAt}>{formatDateTime(p.updatedAt)}</time></dd>
              </div>
            </dl>
          </div>
          <div className="flex items-center gap-1">
            <Link href={`/builder/${p.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Open
            </Link>
            <RenamePortfolioDialog id={p.id} name={p.name} />
            <DeletePortfolioDialog id={p.id} name={p.name} />
          </div>
        </li>
      ))}
    </ul>
  )
}
