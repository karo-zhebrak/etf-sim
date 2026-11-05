import type { Metadata } from "next"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

import { SignupForm } from "../forms"

export const metadata: Metadata = { title: "Create an account" }

export default function SignupPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle><h1 className="text-base font-medium">Create an account</h1></CardTitle>
        <CardDescription>We&apos;ll email you a link to confirm your address.</CardDescription>
      </CardHeader>
      <CardContent>
        <SignupForm />
      </CardContent>
    </Card>
  )
}
