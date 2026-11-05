import type { Metadata } from "next"
import { Suspense } from "react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

import { LoginForm } from "../forms"

export const metadata: Metadata = { title: "Sign in" }

export default function LoginPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle><h1 className="text-base font-medium">Sign in</h1></CardTitle>
        <CardDescription>Sign in to use the simulator.</CardDescription>
      </CardHeader>
      <CardContent>
        {/* The form reads ?next= and ?error= from the URL, which happens at request time. */}
        <Suspense fallback={<div className="h-56" />}>
          <LoginForm />
        </Suspense>
      </CardContent>
    </Card>
  )
}
