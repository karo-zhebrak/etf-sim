"use client"

import { Eye, EyeOff } from "lucide-react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useActionState, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import {
  requestPasswordReset, signIn, signUp, updatePassword, type FormState,
} from "./actions"

const initial: FormState = {}

function Feedback({ state }: { state: FormState }) {
  if (state.error) {
    return <p role="alert" className="text-sm text-destructive">{state.error}</p>
  }
  if (state.message) {
    return <p role="status" className="text-sm text-muted-foreground">{state.message}</p>
  }
  return null
}

function EmailField({ defaultValue }: { defaultValue?: string }) {
  return (
    <div className="space-y-2">
      <Label htmlFor="email">Email address</Label>
      <Input id="email" name="email" type="email" autoComplete="email" required defaultValue={defaultValue} />
    </div>
  )
}

function PasswordField({ name = "password", label = "Password", autoComplete, hint }: {
  name?: string; label?: string; autoComplete: string; hint?: string
}) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <div className="relative">
        <Input id={name} name={name} type={visible ? "text" : "password"} autoComplete={autoComplete} required
               className="pr-10" minLength={autoComplete === "new-password" ? 8 : undefined}
               aria-describedby={hint ? `${name}-hint` : undefined} />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          aria-pressed={visible}
          aria-controls={name}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
        </button>
      </div>
      {hint && <p id={`${name}-hint`} className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

export function LoginForm() {
  const params = useSearchParams()
  const [state, action, pending] = useActionState(signIn, initial)
  const linkError = params.get("error") === "link"
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={params.get("next") ?? "/"} />
      {linkError && !state.error && (
        <p role="alert" className="text-sm text-destructive">
          That link is invalid or has expired. Sign in, or request a new link.
        </p>
      )}
      <EmailField defaultValue={state.email} />
      <PasswordField autoComplete="current-password" />
      <Feedback state={state} />
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
      <div className="flex justify-between text-sm">
        <Link href="/forgot-password" className="text-muted-foreground underline-offset-4 hover:underline">
          Forgotten your password?
        </Link>
        <Link href={params.get("next") ? `/signup?next=${encodeURIComponent(params.get("next")!)}` : "/signup"}
              className="underline-offset-4 hover:underline">Create an account</Link>
      </div>
    </form>
  )
}

export function SignupForm() {
  const params = useSearchParams()
  const next = params.get("next")
  const [state, action, pending] = useActionState(signUp, initial)
  if (state.message) {
    return <Feedback state={state} />
  }
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next ?? "/"} />
      <EmailField defaultValue={state.email} />
      <PasswordField autoComplete="new-password" hint="At least 8 characters." />
      <Feedback state={state} />
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Creating account…" : "Create account"}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"} className="text-foreground underline-offset-4 hover:underline">Sign in</Link>
      </p>
    </form>
  )
}

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, initial)
  if (state.message) {
    return <Feedback state={state} />
  }
  return (
    <form action={action} className="space-y-4">
      <EmailField defaultValue={state.email} />
      <Feedback state={state} />
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Sending…" : "Send reset link"}
      </Button>
      <p className="text-center text-sm">
        <Link href="/login" className="text-muted-foreground underline-offset-4 hover:underline">Back to sign in</Link>
      </p>
    </form>
  )
}

export function UpdatePasswordForm() {
  const [state, action, pending] = useActionState(updatePassword, initial)
  return (
    <form action={action} className="space-y-4">
      <PasswordField label="New password" autoComplete="new-password" hint="At least 8 characters." />
      <PasswordField name="confirm" label="Confirm new password" autoComplete="new-password" />
      <Feedback state={state} />
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Saving…" : "Save new password"}
      </Button>
    </form>
  )
}
