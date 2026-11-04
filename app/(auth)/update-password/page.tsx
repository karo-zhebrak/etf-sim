import type { Metadata } from "next"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

import { UpdatePasswordForm } from "../forms"

export const metadata: Metadata = { title: "Choose a new password" }

// Requires a session: the proxy sends signed-out visitors to /login, and the
// updatePassword action checks the session itself. Reached from the reset email link.
export default function UpdatePasswordPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Choose a new password</CardTitle>
        <CardDescription>You&apos;ll stay signed in after saving it.</CardDescription>
      </CardHeader>
      <CardContent>
        <UpdatePasswordForm />
      </CardContent>
    </Card>
  )
}
