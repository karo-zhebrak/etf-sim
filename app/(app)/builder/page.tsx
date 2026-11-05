import type { Metadata } from "next"

import { Builder } from "./builder"

export const metadata: Metadata = { title: "Portfolio Builder" }

/** A new, unsaved portfolio. Saving it moves the URL to /builder/[id]. */
export default function NewPortfolioPage() {
  return <Builder initial={{ id: null, name: "", amount: null, currency: "GBP", updatedAt: null }} />
}
