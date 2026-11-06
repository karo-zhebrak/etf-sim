import "server-only"

import { redirect } from "next/navigation"
import { connection } from "next/server"

import { createClient } from "@/lib/supabase/server"

export type User = {
  id: string
  email: string | null
}

/**
 * The signed-in user, or a redirect to /login. Verifies the session JWT (getClaims),
 * so it is safe to use for authorization. Reads cookies: call it inside <Suspense>.
 *
 * `connection()` keeps this out of prerendering, including the App Shell that partial
 * prefetching builds with cookies available: Supabase compares Date.now() with the token
 * expiry, which Cache Components rejects during a prerender. Call getCurrentUser() before
 * any other Supabase read in a component so those reads are request-time too.
 */
export async function getCurrentUser(): Promise<User> {
  const user = await getOptionalUser()
  if (!user) redirect("/login")
  return user
}

/** The signed-in user, or null for visitors without an account (the builder and analysis
 * work signed out). Same verification and prerendering rules as getCurrentUser(). */
export async function getOptionalUser(): Promise<User | null> {
  await connection()
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getClaims()
  if (error || !data?.claims?.sub) return null
  return { id: data.claims.sub, email: (data.claims.email as string | undefined) ?? null }
}

/** Only allow redirects to paths on this site (prevents open redirects via ?next=). */
export function safeNextPath(next: unknown, fallback = "/"): string {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return fallback
  }
  return next
}
