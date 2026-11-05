import type { Metadata } from "next"

export const metadata: Metadata = { title: "Portfolio Builder" }

// Placeholder until the builder steps ship (build plan iterations 2–10).
export default function BuilderPage() {
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight">Portfolio Builder</h1>
      <p className="max-w-prose text-muted-foreground">
        Coming soon: choose an investment amount, pick up to five ETFs, set allocations and
        analyse the portfolio.
      </p>
    </div>
  )
}
