import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/env"

// The app works without an account (home, a new portfolio in the builder, all analysis).
// Signing in is needed for these: the user's saved portfolios, account and password change.
const SIGNED_IN_ONLY = ["/portfolios", "/account", "/update-password"]
/** A saved portfolio, e.g. /builder/<uuid>. The new-portfolio builder (/builder) is open. */
const isSavedPortfolio = (path: string) => /^\/builder\/[^/]+/.test(path)
// Signed-in users visiting these are sent to the app instead.
const SIGNED_OUT_ONLY = ["/login", "/signup", "/forgot-password"]

const matches = (path: string, prefixes: string[]) =>
  prefixes.some((p) => path === p || path.startsWith(`${p}/`))

/**
 * Refreshes the Supabase session cookie on every request and sends signed-out visitors
 * to /login for the signed-in-only areas. This is a convenience gate only: Server Actions, Route Handlers
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

  if (!signedIn && (matches(path, SIGNED_IN_ONLY) || isSavedPortfolio(path))) {
    const url = new URL("/login", request.url)
    url.searchParams.set("next", path + request.nextUrl.search)
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
