import Link from "next/link"
import { signOut } from "@/auth"
import { cookies } from "next/headers"
import { Button } from "@/components/ui/button"

export function Nav() {
  return (
    <nav className="bg-card border-b border-border px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-6">
        <span className="font-mono text-sm tracking-widest uppercase text-foreground">
          Market Digest
        </span>
        <Link
          href="/digest"
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Digest
        </Link>
        <Link
          href="/settings/accounts"
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Accounts
        </Link>
        <Link
          href="/settings/alerts"
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Alerts
        </Link>
      </div>
      <form
        action={async () => {
          "use server"
          const cookieStore = await cookies()
          cookieStore.set("site-auth", "", { maxAge: 0 })
          await signOut({ redirectTo: "/login" })
        }}
      >
        <Button
          variant="ghost"
          size="sm"
          type="submit"
          className="font-mono text-xs text-muted-foreground hover:text-foreground"
        >
          Sign out
        </Button>
      </form>
    </nav>
  )
}
