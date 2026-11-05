import type { Metadata } from "next"

export const metadata: Metadata = { title: "My Portfolios" }

// Placeholder until saved portfolios ship (build plan iteration 1).
export default function PortfoliosPage() {
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight">My Portfolios</h1>
      <p className="max-w-prose text-muted-foreground">
        Coming soon: your saved portfolios will appear here, ready to open, edit or delete.
      </p>
    </div>
  )
}
