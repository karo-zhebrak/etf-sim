"use client" // Error boundaries must be Client Components

import Link from "next/link"
import { useEffect } from "react"

import { Button, buttonVariants } from "@/components/ui/button"

/** Shown inside the app shell (navigation stays) when a page fails unexpectedly. */
export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])
  return (
    <div className="mx-auto max-w-md space-y-4 py-12 text-center">
      <h1 className="text-xl font-semibold tracking-tight">Something went wrong</h1>
      <p className="text-sm text-muted-foreground">
        This page couldn&apos;t be loaded. Your saved portfolios are safe. Please try again.
      </p>
      <div className="flex justify-center gap-2">
        <Button onClick={() => retry()}>Try again</Button>
        <Link href="/portfolios" className={buttonVariants({ variant: "outline" })}>My Portfolios</Link>
      </div>
    </div>
  )
}
