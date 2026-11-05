import type { Metadata } from "next"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

import { ForgotPasswordForm } from "../forms"

export const metadata: Metadata = { title: "Reset your password" }

export default function ForgotPasswordPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle><h1 className="text-base font-medium">Reset your password</h1></CardTitle>
        <CardDescription>Enter your email address and we&apos;ll send you a reset link.</CardDescription>
      </CardHeader>
      <CardContent>
        <ForgotPasswordForm />
      </CardContent>
    </Card>
  )
}
