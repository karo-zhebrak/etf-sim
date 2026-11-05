import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"

import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatDateTime, formatMoney } from "@/lib/format"
import { getPortfolio } from "@/lib/portfolios"

export const metadata: Metadata = { title: "Portfolio Builder" }

// The page itself never awaits params, so its frame stays in the static shell; the
// portfolio streams in behind the boundary (see "Maximizing the static shell" in the docs).
export default function PortfolioBuilderPage({ params }: PageProps<"/builder/[id]">) {
  return (
    <div className="space-y-6">
      <Link href="/portfolios" className="text-sm text-muted-foreground hover:underline">← My Portfolios</Link>
      <Suspense fallback={<Card className="h-40" />}>
        <PortfolioOverview params={params} />
      </Suspense>
    </div>
  )
}

async function PortfolioOverview({ params }: { params: PageProps<"/builder/[id]">["params"] }) {
  const { id } = await params
  const portfolio = await getPortfolio(id)
  if (!portfolio) notFound()
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">{portfolio.name}</h1>
      <Card>
        <CardHeader>
          <CardTitle>Builder coming soon</CardTitle>
          <CardDescription>
            The investment amount, ETF selection and analysis steps arrive in the next iterations.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1 text-sm text-muted-foreground">
          <p>{portfolio.etfCount} {portfolio.etfCount === 1 ? "ETF" : "ETFs"} · {portfolio.amount === null ? `No amount yet (${portfolio.currency})` : formatMoney(portfolio.amount, portfolio.currency)}</p>
          <p>Last modified {formatDateTime(portfolio.updatedAt)}</p>
          <Link href="/portfolios" className={buttonVariants({ variant: "outline", size: "sm", className: "mt-3" })}>
            Back to My Portfolios
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
