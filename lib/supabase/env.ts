// Public Supabase settings for the app. Only the publishable (anon) key belongs here:
// it is safe in the browser because every table is protected by RLS.
// Never use the service role key in the Next.js app.

export function supabaseUrl(): string {
  const v = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!v) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set (see .env.example)")
  return v
}

export function supabasePublishableKey(): string {
  const v = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!v) throw new Error("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not set (see .env.example)")
  return v
}
