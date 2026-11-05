import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"

import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getCurrentUser } from "@/lib/auth"

import { signOut } from "../../(auth)/actions"

export const metadata: Metadata = { title: "Account" }

export default function AccountPage() {
  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
      <Card>
        <CardHeader>
          <CardTitle>Sign-in details</CardTitle>
          <CardDescription>The email address and password you use to sign in.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <Suspense fallback={<div className="h-10" />}>
            <AccountEmail />
          </Suspense>
          <div className="flex flex-wrap gap-2">
            <Link href="/update-password" className={buttonVariants({ variant: "outline" })}>
              Change password
            </Link>
            <form action={signOut}>
              <Button type="submit" variant="ghost">Log out</Button>
            </form>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

async function AccountEmail() {
  const user = await getCurrentUser()
  return (
    <div>
      <p className="text-muted-foreground">Email address</p>
      <p className="font-medium">{user.email}</p>
    </div>
  )
}
