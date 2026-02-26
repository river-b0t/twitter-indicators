import Link from "next/link"
import { signOut } from "@/auth"
import { cookies } from "next/headers"
import { Button } from "@/components/ui/button"

export function Nav() {
  return (
    <nav className="border-b px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-6">
        <span className="font-semibold text-sm">Market Digest</span>
        <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
          Digest
        </Link>
        <Link href="/settings/accounts" className="text-sm text-muted-foreground hover:text-foreground">
          Accounts
        </Link>
      </div>
      <form
        action={async () => {
          "use server"
          const cookieStore = await cookies()
          cookieStore.set('site-auth', '', { maxAge: 0 })
          await signOut({ redirectTo: "/login" })
        }}
      >
        <Button variant="ghost" size="sm" type="submit">Sign out</Button>
      </form>
    </nav>
  )
}
