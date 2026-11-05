import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"

import { Card } from "@/components/ui/card"
import { listEtfs } from "@/lib/etfs"
import { getPortfolio } from "@/lib/portfolios"

import { Builder } from "../builder"

export const metadata: Metadata = { title: "Portfolio Builder" }

// The page never awaits params itself, so its frame stays in the static shell; the saved
// portfolio streams in behind the boundary.
export default function SavedPortfolioPage({ params }: PageProps<"/builder/[id]">) {
  return (
    <Suspense fallback={<Card className="h-72" />}>
      <SavedBuilder params={params} />
    </Suspense>
  )
}

async function SavedBuilder({ params }: { params: PageProps<"/builder/[id]">["params"] }) {
  const { id } = await params
  const [portfolio, etfOptions] = await Promise.all([getPortfolio(id), listEtfs()])
  if (!portfolio) notFound()
  return (
    <Builder
      key={portfolio.id}
      etfOptions={etfOptions}
      initial={{
        id: portfolio.id,
        name: portfolio.name,
        amount: portfolio.amount,
        currency: portfolio.currency,
        updatedAt: portfolio.updatedAt,
        etfs: portfolio.etfs,
      }}
    />
  )
}
