import Link from "next/link"

import { buttonVariants } from "@/components/ui/button"

export default function Home() {
  return (
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
  )
}
