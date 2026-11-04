import "server-only"

import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

import { supabasePublishableKey, supabaseUrl } from "./env"

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 * Queries run as the signed-in user, so RLS applies. Reads cookies, so with Cache
 * Components any component using it must render inside a <Suspense> boundary.
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // Server Components can't set cookies. The proxy refreshes the session
          // on every request, so this is safe to ignore there.
        }
      },
    },
  })
}
