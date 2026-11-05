"use server"

import { refresh } from "next/cache"
import { redirect } from "next/navigation"

import { isUuid, MAX_NAME_LENGTH } from "@/lib/portfolio-rules"
import { createClient } from "@/lib/supabase/server"

export type ActionState = { error?: string; ok?: boolean }

/** Supabase client for the signed-in user. Every action authorizes itself; RLS also
 * restricts each statement to the user's own portfolios. */
async function authedClient() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  if (!data?.claims) redirect("/login")
  return supabase
}

function readName(formData: FormData): string | { error: string } {
  const name = String(formData.get("name") ?? "").trim().replace(/\s+/g, " ")
  if (!name) return { error: "Give your portfolio a name." }
  if (name.length > MAX_NAME_LENGTH) return { error: `Use ${MAX_NAME_LENGTH} characters or fewer.` }
  return name
}

export async function createPortfolio(_: ActionState, formData: FormData): Promise<ActionState> {
  const name = readName(formData)
  if (typeof name !== "string") return name
  const supabase = await authedClient()
  const { error } = await supabase.from("portfolios").insert({ name })
  if (error) return { error: "We couldn't create the portfolio. Please try again." }
  refresh()
  return { ok: true }
}

export async function renamePortfolio(_: ActionState, formData: FormData): Promise<ActionState> {
  const id = String(formData.get("id") ?? "")
  const name = readName(formData)
  if (typeof name !== "string") return name
  if (!isUuid(id)) return { error: "That portfolio doesn't exist." }
  const supabase = await authedClient()
  const { data, error } = await supabase.from("portfolios").update({ name }).eq("id", id).select("id")
  if (error) return { error: "We couldn't rename the portfolio. Please try again." }
  if (!data?.length) return { error: "That portfolio doesn't exist." }
  refresh()
  return { ok: true }
}

export async function deletePortfolio(_: ActionState, formData: FormData): Promise<ActionState> {
  const id = String(formData.get("id") ?? "")
  if (!isUuid(id)) return { error: "That portfolio doesn't exist." }
  const supabase = await authedClient()
  const { error } = await supabase.from("portfolios").delete().eq("id", id)
  if (error) return { error: "We couldn't delete the portfolio. Please try again." }
  refresh()
  return { ok: true }
}
