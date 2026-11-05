import Link from "next/link"

import { buttonVariants } from "@/components/ui/button"

/** Shown inside the app shell, e.g. for a portfolio that was deleted or belongs to someone else. */
export default function AppNotFound() {
  return (
    <div className="mx-auto max-w-md space-y-4 py-12 text-center">
      <h1 className="text-xl font-semibold tracking-tight">Page not found</h1>
      <p className="text-sm text-muted-foreground">
        This page doesn&apos;t exist. If you followed a link to a portfolio, it may have been deleted.
      </p>
      <div className="flex justify-center gap-2">
        <Link href="/portfolios" className={buttonVariants()}>My Portfolios</Link>
        <Link href="/builder" className={buttonVariants({ variant: "outline" })}>Start a portfolio</Link>
      </div>
    </div>
  )
}
