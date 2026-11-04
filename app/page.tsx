import { Suspense } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getCurrentUser } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"

import { signOut } from "./(auth)/actions"

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-14 w-full max-w-4xl items-center justify-between px-4">
          <span className="font-semibold tracking-tight">ETF Portfolio Simulator</span>
          {/* Reads the session, so it streams in behind its own boundary. */}
          <Suspense fallback={<div className="h-8 w-40" />}>
            <UserMenu />
          </Suspense>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 space-y-6 px-4 py-10">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Welcome</h1>
          <p className="max-w-prose text-muted-foreground">
            Experiment with simulated ETF portfolios to see how they behave. Simulations are
            illustrations only: they are not investment advice, and past performance does not
            predict future returns.
          </p>
        </div>
        <Suspense fallback={<Card className="h-32" />}>
          <DataStatus />
        </Suspense>
      </main>
    </div>
  )
}

async function UserMenu() {
  const user = await getCurrentUser()
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="hidden text-muted-foreground sm:inline">{user.email}</span>
      <form action={signOut}>
        <Button type="submit" variant="outline" size="sm">Sign out</Button>
      </form>
    </div>
  )
}

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" })

async function DataStatus() {
  // Runs as the signed-in user: these reads go through RLS.
  await getCurrentUser()
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
