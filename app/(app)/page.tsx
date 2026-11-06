import Link from "next/link"
import { connection } from "next/server"
import { Suspense } from "react"

import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { createClient } from "@/lib/supabase/server"

export default function Home() {
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">Build and analyse an ETF portfolio</h1>
        <p className="max-w-prose text-muted-foreground">
          Choose an amount, pick up to five ETFs and see how the combination behaved: its
          performance, where it invests and how the funds move together. Everything here is a
          simulation for learning. It is not investment advice, and past performance does not
          predict future returns.
        </p>
        <p className="max-w-prose text-sm text-muted-foreground">
          No account needed to try it. Sign in or create a free account to save your portfolios.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link href="/builder" className={buttonVariants()}>Start a portfolio</Link>
        </div>
      </div>
      <Suspense fallback={<Card className="h-32" />}>
        <DataStatus />
      </Suspense>
    </div>
  )
}

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" })

async function DataStatus() {
  // Market data is readable signed in or not (RLS); connection() keeps it request-time.
  await connection()
  const supabase = await createClient()
  const [funds, latest] = await Promise.all([
    supabase.from("etfs").select("isin", { count: "exact", head: true }),
    supabase.from("nav_prices").select("date").order("date", { ascending: false }).limit(1).maybeSingle(),
  ])
  const ok = !funds.error && !latest.error
  return (
    <Card>
      <CardHeader>
        <CardTitle>Market data</CardTitle>
        <CardDescription>Updated monthly from issuer files. FX rates: European Central Bank.</CardDescription>
      </CardHeader>
      <CardContent className="text-sm">
        {ok ? (
          <p>
            {funds.count ?? 0} funds, with daily prices up to{" "}
            {latest.data ? dateFmt.format(new Date(latest.data.date)) : "—"}.
          </p>
        ) : (
          <p className="text-destructive">Market data could not be loaded.</p>
        )}
      </CardContent>
    </Card>
  )
}
