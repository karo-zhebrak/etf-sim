import type { Metadata } from "next"
import { Suspense } from "react"

import { Card } from "@/components/ui/card"
import { listEtfs } from "@/lib/etfs"

import { Builder } from "./builder"

export const metadata: Metadata = { title: "Portfolio Builder" }

/** A new, unsaved portfolio. Saving it moves the URL to /builder/[id]. */
export default function NewPortfolioPage() {
  return (
    <Suspense fallback={<Card className="h-72" />}>
      <NewBuilder />
    </Suspense>
  )
}

async function NewBuilder() {
  const etfOptions = await listEtfs()
  return (
    <Builder
      initial={{ id: null, name: "", amount: null, currency: "GBP", updatedAt: null, etfs: [] }}
      etfOptions={etfOptions}
    />
  )
}
