"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Suspense } from "react"

import { cn } from "@/lib/utils"

const LINKS = [
  { href: "/builder", label: "Portfolio Builder" },
  { href: "/portfolios", label: "My Portfolios" },
  { href: "/account", label: "Account" },
]

function NavLinks({ pathname, className }: { pathname: string | null; className?: string }) {
  return (
    <nav aria-label="Main" className={cn("flex items-center gap-1", className)}>
      {LINKS.map(({ href, label }) => {
        const active = pathname !== null && (pathname === href || pathname.startsWith(`${href}/`))
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition-colors",
              active ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            {label}
          </Link>
        )
      })}
    </nav>
  )
}

function ActiveNavLinks({ className }: { className?: string }) {
  return <NavLinks pathname={usePathname()} className={className} />
}

/** Main navigation, highlighting the current section. The pathname is URL data, so on
 * dynamic routes it resolves at request time; until then the links render unhighlighted. */
export function AppNav({ className }: { className?: string }) {
  return (
    <Suspense fallback={<NavLinks pathname={null} className={className} />}>
      <ActiveNavLinks className={className} />
    </Suspense>
  )
}
