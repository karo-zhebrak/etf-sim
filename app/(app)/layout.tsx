import Link from "next/link"
import { Suspense } from "react"

import { AppNav } from "@/components/app-nav"
import { Button } from "@/components/ui/button"
import { getCurrentUser } from "@/lib/auth"

import { signOut } from "../(auth)/actions"

/** Shell for signed-in pages. The layout itself never reads the session, so it stays in
 * the static shell; only the user menu streams in behind its Suspense boundary. */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-4 px-4">
          <Link href="/" className="shrink-0 font-semibold tracking-tight">
            ETF Portfolio Simulator
          </Link>
          <AppNav className="hidden md:flex" />
          <div className="ml-auto">
            <Suspense fallback={<div className="h-8 w-24" />}>
              <UserMenu />
            </Suspense>
          </div>
        </div>
        {/* Small screens: the same links in a scrollable row under the title. */}
        <div className="border-t md:hidden">
          <AppNav className="mx-auto max-w-6xl overflow-x-auto px-2 py-1.5" />
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
    </div>
  )
}

async function UserMenu() {
  const user = await getCurrentUser()
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="hidden max-w-56 truncate text-muted-foreground lg:inline">{user.email}</span>
      <form action={signOut}>
        <Button type="submit" variant="outline" size="sm">Log out</Button>
      </form>
    </div>
  )
}
