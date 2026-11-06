import type { Metadata } from "next"
import { Suspense } from "react"

import { Card } from "@/components/ui/card"
import { getOptionalUser } from "@/lib/auth"
import { listEtfs } from "@/lib/etfs"

import { Builder } from "./builder"

export const metadata: Metadata = { title: "Portfolio Builder" }

/** A new, unsaved portfolio. Works signed out; saving needs an account and moves the URL to /builder/[id]. */
export default function NewPortfolioPage() {
  return (
    <Suspense fallback={<Card className="h-72" />}>
      <NewBuilder />
    </Suspense>
  )
}

async function NewBuilder() {
  const [user, etfOptions] = await Promise.all([getOptionalUser(), listEtfs()])
  return (
    <Builder
      initial={{ id: null, name: "", amount: null, currency: "GBP", updatedAt: null, etfs: [] }}
      etfOptions={etfOptions}
      signedIn={user !== null}
    />
  )
}
