import type { EmailOtpType } from "@supabase/supabase-js"
import { NextResponse, type NextRequest } from "next/server"

import { safeNextPath } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"

/**
 * Target of the links in Supabase auth emails (sign-up confirmation, password reset).
 * Handles both the PKCE `?code=` flow (default) and `?token_hash=&type=` links
 * (if the email templates are customised), then sends the user on to `next`.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const next = safeNextPath(searchParams.get("next"))
  const code = searchParams.get("code")
  const tokenHash = searchParams.get("token_hash")
  const type = searchParams.get("type") as EmailOtpType | null

  const supabase = await createClient()
  let ok = false
  if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error
  } else if (tokenHash && type) {
    ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error
  }

  if (ok) return NextResponse.redirect(new URL(next, request.url))
  const failed = new URL("/login", request.url)
  failed.searchParams.set("error", "link")
  return NextResponse.redirect(failed)
}
