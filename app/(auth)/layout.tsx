import Link from "next/link"

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-muted/40 px-4 py-12">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            ETF Portfolio Simulator
          </Link>
          <p className="text-sm text-muted-foreground">
            Learn how ETF portfolios behave with simulated portfolios. No real money involved.
          </p>
        </div>
        {children}
      </div>
    </main>
  )
}
