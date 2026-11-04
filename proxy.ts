import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/env"

// Routes reachable without signing in. Everything else requires a session.
const PUBLIC_PATHS = ["/login", "/signup", "/forgot-password", "/auth"]
// Signed-in users visiting these are sent to the app instead.
const SIGNED_OUT_ONLY = ["/login", "/signup", "/forgot-password"]

const matches = (path: string, prefixes: string[]) =>
  prefixes.some((p) => path === p || path.startsWith(`${p}/`))

/**
 * Refreshes the Supabase session cookie on every request and redirects signed-out
 * visitors to /login. This is a convenience gate only: Server Actions, Route Handlers
 * and data reads check the session themselves, and RLS protects the data.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value))
      },
    },
  })

  // Verifies the JWT (and refreshes it when expired). Don't run code between
  // createServerClient and this call.
  const { data } = await supabase.auth.getClaims()
  const signedIn = Boolean(data?.claims)
  const path = request.nextUrl.pathname

  const redirectTo = (target: URL) => {
    const redirect = NextResponse.redirect(target)
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c))
    return redirect
  }

  if (!signedIn && !matches(path, PUBLIC_PATHS)) {
    const url = new URL("/login", request.url)
    if (path !== "/") url.searchParams.set("next", path + request.nextUrl.search)
    return redirectTo(url)
  }
  if (signedIn && matches(path, SIGNED_OUT_ONLY)) {
    return redirectTo(new URL("/", request.url))
  }
  return response
}

export const config = {
  matcher: [
    // Everything except Next.js internals and static files.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
}
