import "server-only"

import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"

export type User = {
  id: string
  email: string | null
}

/**
 * The signed-in user, or a redirect to /login. Verifies the session JWT (getClaims),
 * so it is safe to use for authorization. Reads cookies: call it inside <Suspense>.
 */
export async function getCurrentUser(): Promise<User> {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getClaims()
  if (error || !data?.claims?.sub) {
    redirect("/login")
  }
  return { id: data.claims.sub, email: (data.claims.email as string | undefined) ?? null }
}

/** Only allow redirects to paths on this site (prevents open redirects via ?next=). */
export function safeNextPath(next: unknown, fallback = "/"): string {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return fallback
  }
  return next
}
