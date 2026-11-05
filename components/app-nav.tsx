"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"

const LINKS = [
  { href: "/builder", label: "Portfolio Builder" },
  { href: "/portfolios", label: "My Portfolios" },
  { href: "/account", label: "Account" },
]

/** Main navigation links, highlighting the current section. */
export function AppNav({ className }: { className?: string }) {
  const pathname = usePathname()
  return (
    <nav aria-label="Main" className={cn("flex items-center gap-1", className)}>
      {LINKS.map(({ href, label }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`)
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
