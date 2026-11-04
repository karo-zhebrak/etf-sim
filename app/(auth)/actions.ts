"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { safeNextPath } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"

export type FormState = { error?: string; message?: string; email?: string }

const MIN_PASSWORD_LENGTH = 8
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

async function siteOrigin(): Promise<string> {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "")
  const h = await headers()
  const host = h.get("x-forwarded-host") ?? h.get("host")
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https")
  return `${proto}://${host}`
}

function readEmail(formData: FormData): string {
  return String(formData.get("email") ?? "").trim().toLowerCase()
}

export async function signIn(_: FormState, formData: FormData): Promise<FormState> {
  const email = readEmail(formData)
  const password = String(formData.get("password") ?? "")
  if (!EMAIL_RE.test(email) || !password) {
    return { error: "Enter your email address and password.", email }
  }
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    if (error.code === "email_not_confirmed") {
      return { error: "Please confirm your email address first. Check your inbox for the link.", email }
    }
    return { error: "Incorrect email address or password.", email }
  }
  redirect(safeNextPath(formData.get("next")))
}

export async function signUp(_: FormState, formData: FormData): Promise<FormState> {
  const email = readEmail(formData)
  const password = String(formData.get("password") ?? "")
  if (!EMAIL_RE.test(email)) return { error: "Enter a valid email address.", email }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `Use a password of at least ${MIN_PASSWORD_LENGTH} characters.`, email }
  }
  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${await siteOrigin()}/auth/callback?next=/` },
  })
  if (error) {
    if (error.code === "weak_password") return { error: "That password is too weak. Try a longer one.", email }
    if (error.code === "over_email_send_rate_limit") {
      return { error: "Too many emails sent. Please wait a few minutes and try again.", email }
    }
    return { error: "We couldn't create your account. Please try again.", email }
  }
  // With email confirmation off, Supabase signs the user straight in.
  if (data.session) redirect("/")
  // Same message whether or not the address is already registered, so the form
  // doesn't reveal which emails have accounts.
  return { message: `We've sent a confirmation link to ${email}. Open it to finish creating your account.` }
}

export async function requestPasswordReset(_: FormState, formData: FormData): Promise<FormState> {
  const email = readEmail(formData)
  if (!EMAIL_RE.test(email)) return { error: "Enter a valid email address.", email }
  const supabase = await createClient()
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await siteOrigin()}/auth/callback?next=/update-password`,
  })
  if (error?.code === "over_email_send_rate_limit") {
    return { error: "Too many emails sent. Please wait a few minutes and try again.", email }
  }
  return { message: `If an account exists for ${email}, we've sent a link to reset your password.` }
}

export async function updatePassword(_: FormState, formData: FormData): Promise<FormState> {
  const password = String(formData.get("password") ?? "")
  const confirm = String(formData.get("confirm") ?? "")
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `Use a password of at least ${MIN_PASSWORD_LENGTH} characters.` }
  }
  if (password !== confirm) return { error: "The two passwords don't match." }
  const supabase = await createClient()
  // Authorize inside the action: never rely on the proxy alone.
  const { data: claims } = await supabase.auth.getClaims()
  if (!claims?.claims) redirect("/login")
  const { error } = await supabase.auth.updateUser({ password })
  if (error) {
    if (error.code === "same_password") return { error: "Choose a password different from your current one." }
    if (error.code === "weak_password") return { error: "That password is too weak. Try a longer one." }
    return { error: "We couldn't update your password. Please try again." }
  }
  redirect("/")
}

export async function signOut(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect("/login")
}
