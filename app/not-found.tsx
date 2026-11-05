import type { Metadata } from "next"
import Link from "next/link"

import { buttonVariants } from "@/components/ui/button"

export const metadata: Metadata = { title: "Page not found" }

/** Unknown URLs. */
export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-16">
      <div className="max-w-md space-y-4 text-center">
        <p className="text-sm font-semibold tracking-tight">ETF Portfolio Simulator</p>
        <h1 className="text-xl font-semibold tracking-tight">Page not found</h1>
        <p className="text-sm text-muted-foreground">We couldn&apos;t find the page you were looking for.</p>
        <Link href="/" className={buttonVariants()}>Go to the home page</Link>
      </div>
    </main>
  )
}
