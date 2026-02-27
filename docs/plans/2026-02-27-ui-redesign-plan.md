# UI Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restyle the full app to a dark slate terminal aesthetic — off-white text, green/red sentiment accents, monospace handles/numbers, left-border sentiment cards.

**Architecture:** CSS variable override in `globals.css` locks the entire app to dark slate without touching component logic. Font swap to Inter + JetBrains Mono. Targeted component updates for sentiment chrome (left-border cards, dot indicators, mono type). No structural/data changes.

**Tech Stack:** Next.js 16, Tailwind CSS v4, shadcn/ui, next/font/google (Inter, JetBrains Mono)

---

## Task 1: Replace CSS theme tokens with dark slate palette

**Files:**
- Modify: `app/globals.css`

**Step 1: Update `@theme inline` font variable names**

In `globals.css`, find these two lines in the `@theme inline` block:
```css
--font-sans: var(--font-geist-sans);
--font-mono: var(--font-geist-mono);
```

Replace with:
```css
--font-sans: var(--font-inter);
--font-mono: var(--font-jetbrains-mono);
```

**Step 2: Replace the entire `:root` block**

Find the existing `:root { ... }` block and replace it entirely:

```css
:root {
  --radius: 0.5rem;
  --background: oklch(0.13 0.01 240);
  --foreground: oklch(0.95 0 0);
  --card: oklch(0.17 0.01 240);
  --card-foreground: oklch(0.95 0 0);
  --popover: oklch(0.17 0.01 240);
  --popover-foreground: oklch(0.95 0 0);
  --primary: oklch(0.95 0 0);
  --primary-foreground: oklch(0.13 0.01 240);
  --secondary: oklch(0.20 0.01 240);
  --secondary-foreground: oklch(0.95 0 0);
  --muted: oklch(0.20 0.01 240);
  --muted-foreground: oklch(0.55 0.01 240);
  --accent: oklch(0.22 0.01 240);
  --accent-foreground: oklch(0.95 0 0);
  --destructive: oklch(0.577 0.245 27.325);
  --border: oklch(0.25 0.01 240);
  --input: oklch(0.22 0.01 240);
  --ring: oklch(0.55 0.01 240);
  --chart-1: oklch(0.646 0.222 41.116);
  --chart-2: oklch(0.6 0.118 184.704);
  --chart-3: oklch(0.398 0.07 227.392);
  --chart-4: oklch(0.828 0.189 84.429);
  --chart-5: oklch(0.769 0.188 70.08);
  --sidebar: oklch(0.17 0.01 240);
  --sidebar-foreground: oklch(0.95 0 0);
  --sidebar-primary: oklch(0.95 0 0);
  --sidebar-primary-foreground: oklch(0.13 0.01 240);
  --sidebar-accent: oklch(0.22 0.01 240);
  --sidebar-accent-foreground: oklch(0.95 0 0);
  --sidebar-border: oklch(0.25 0.01 240);
  --sidebar-ring: oklch(0.55 0.01 240);
}
```

**Step 3: Remove the `.dark { ... }` block entirely**

The app is locked to dark — the `.dark` block is unused. Delete it.

**Step 4: Verify build**

```bash
cd /Users/openclaw/river-workspace/twitter-indicators && npm run build
```

Expected: clean build.

**Step 5: Commit**

```bash
git add app/globals.css
git commit -m "feat: replace theme tokens with dark slate palette"
```

---

## Task 2: Swap fonts to Inter + JetBrains Mono

**Files:**
- Modify: `app/layout.tsx`

**Step 1: Replace the full file**

```tsx
import type { Metadata } from "next"
import { Inter, JetBrains_Mono } from "next/font/google"
import "./globals.css"

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
})

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: "Market Digest",
  description: "Daily summaries from the accounts that matter.",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${jetbrainsMono.variable} antialiased`}>
        {children}
      </body>
    </html>
  )
}
```

**Step 2: Verify build**

```bash
npm run build
```

Expected: clean build.

**Step 3: Commit**

```bash
git add app/layout.tsx
git commit -m "feat: swap fonts to Inter + JetBrains Mono"
```

---

## Task 3: Restyle nav bar

**Files:**
- Modify: `components/nav.tsx`

**Step 1: Replace the full file**

```tsx
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
          href="/dashboard"
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
```

**Step 2: Verify build**

```bash
npm run build
```

**Step 3: Commit**

```bash
git add components/nav.tsx
git commit -m "feat: restyle nav bar — mono wordmark, dark bg"
```

---

## Task 4: Restyle category filter to tab-style

**Files:**
- Modify: `components/category-filter.tsx`

**Step 1: Replace the full file**

```tsx
"use client"
import { useRouter, useSearchParams } from "next/navigation"

const CATEGORIES = ["all", "traders", "crypto", "onchain", "vc", "tradfi", "thematic", "builders"] as const

export function CategoryFilter({ active }: { active: string }) {
  const router = useRouter()
  const params = useSearchParams()

  function select(cat: string) {
    const p = new URLSearchParams(params.toString())
    if (cat === "all") p.delete("category")
    else p.set("category", cat)
    router.push(`/dashboard?${p.toString()}`)
  }

  return (
    <div className="flex flex-wrap gap-0 border-b border-border">
      {CATEGORIES.map((cat) => (
        <button
          key={cat}
          onClick={() => select(cat)}
          className={`px-3 py-2 text-xs font-mono capitalize transition-colors border-b-2 -mb-px ${
            active === cat
              ? "text-foreground border-foreground"
              : "text-muted-foreground border-transparent hover:text-foreground"
          }`}
        >
          {cat}
        </button>
      ))}
    </div>
  )
}
```

**Step 2: Verify build**

```bash
npm run build
```

**Step 3: Commit**

```bash
git add components/category-filter.tsx
git commit -m "feat: restyle category filter to tab-style with underline"
```

---

## Task 5: Compact dashboard page header

**Files:**
- Modify: `app/dashboard/page.tsx`

**Step 1: Replace the header section**

Find this block in the file:
```tsx
<div className="flex items-center justify-between">
  <div>
    <h1 className="text-2xl font-bold">Market Digest</h1>
    <p className="text-muted-foreground text-sm">{format(date, "EEEE, MMMM d, yyyy")}</p>
  </div>
  <RefreshButton />
</div>
```

Replace with:
```tsx
<div className="flex items-center justify-between">
  <p className="font-mono text-xs text-muted-foreground tracking-wide">
    {format(date, "EEE, MMM d yyyy").toUpperCase()}
  </p>
  <RefreshButton />
</div>
```

**Step 2: Verify build**

```bash
npm run build
```

**Step 3: Commit**

```bash
git add app/dashboard/page.tsx
git commit -m "feat: compact dashboard header — mono date, no title"
```

---

## Task 6: Restyle account cards

**Files:**
- Modify: `components/account-card.tsx`

**Step 1: Replace the full file**

```tsx
import { TickerBadge } from "@/components/ticker-badge"
import Link from "next/link"
import type { TickerData } from "@/lib/finnhub"

const sentimentBorder: Record<string, string> = {
  bullish: "border-l-green-500",
  bearish: "border-l-red-500",
  neutral: "border-l-slate-500",
  mixed: "border-l-amber-500",
}

const sentimentDot: Record<string, string> = {
  bullish: "bg-green-500",
  bearish: "bg-red-500",
  neutral: "bg-slate-500",
  mixed: "bg-amber-500",
}

const sentimentLabel: Record<string, string> = {
  bullish: "text-green-400",
  bearish: "text-red-400",
  neutral: "text-slate-400",
  mixed: "text-amber-400",
}

interface AccountCardProps {
  handle: string
  displayName: string
  categories: string[]
  summary: string | null
  sentiment: string | null
  tickers: string[]
  tickerData?: TickerData | null
  tweetCount: number
  date: string
  status: string
}

export function AccountCard({
  handle,
  displayName,
  summary,
  sentiment,
  tickers,
  tickerData,
  tweetCount,
  date,
  status,
}: AccountCardProps) {
  const borderColor = sentiment
    ? (sentimentBorder[sentiment] ?? "border-l-border")
    : "border-l-transparent"

  return (
    <Link href={`/dashboard/${handle}?date=${date}`}>
      <div
        className={`bg-card border border-border border-l-4 ${borderColor} rounded-lg p-4 cursor-pointer hover:bg-accent transition-colors h-full flex flex-col gap-3`}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-mono text-sm text-foreground">@{handle}</p>
            <p className="text-xs text-muted-foreground">{displayName}</p>
          </div>
          {sentiment && (
            <div className="flex items-center gap-1.5 shrink-0">
              <div
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${sentimentDot[sentiment] ?? "bg-border"}`}
              />
              <span className={`font-mono text-xs ${sentimentLabel[sentiment] ?? "text-muted-foreground"}`}>
                {sentiment}
              </span>
            </div>
          )}
        </div>

        {/* Summary */}
        <div className="flex-1">
          {status === "failed" ? (
            <p className="text-sm text-muted-foreground italic">Digest unavailable</p>
          ) : status === "pending" ? (
            <p className="text-sm text-muted-foreground italic">Processing...</p>
          ) : (
            <p className="text-sm leading-relaxed text-foreground/80">{summary}</p>
          )}
        </div>

        {/* Tickers */}
        {tickers.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {tickers.map((t) => (
              <TickerBadge key={t} ticker={t} entry={tickerData?.[t]} />
            ))}
          </div>
        )}

        {/* Footer */}
        <p className="font-mono text-xs text-muted-foreground">{tweetCount} tweets</p>
      </div>
    </Link>
  )
}
```

**Step 2: Verify build**

```bash
npm run build
```

**Step 3: Commit**

```bash
git add components/account-card.tsx
git commit -m "feat: restyle account cards — left-border sentiment, mono handle, dot indicator"
```

---

## Task 7: Restyle drill-down page

**Files:**
- Modify: `app/dashboard/[handle]/page.tsx`

**Step 1: Replace the full file**

```tsx
import { prisma } from "@/lib/prisma"
import { notFound } from "next/navigation"
import { format, startOfDay, endOfDay } from "date-fns"
import { Card, CardContent } from "@/components/ui/card"
import { TickerBadge } from "@/components/ticker-badge"
import type { TickerData } from "@/lib/finnhub"
import Link from "next/link"
import { ArrowLeft, ExternalLink, Heart, Repeat2 } from "lucide-react"
import type { Tweet } from "@prisma/client"

const sentimentDot: Record<string, string> = {
  bullish: "bg-green-500",
  bearish: "bg-red-500",
  neutral: "bg-slate-500",
  mixed: "bg-amber-500",
}

const sentimentLabel: Record<string, string> = {
  bullish: "text-green-400",
  bearish: "text-red-400",
  neutral: "text-slate-400",
  mixed: "text-amber-400",
}

interface Props {
  params: Promise<{ handle: string }>
  searchParams: Promise<{ date?: string }>
}

export default async function DrilldownPage({ params, searchParams }: Props) {
  const { handle } = await params
  const { date: dateParam } = await searchParams
  const dateStr = dateParam ?? format(new Date(), "yyyy-MM-dd")
  const date = startOfDay(new Date(dateStr))

  const account = await prisma.twitterAccount.findUnique({
    where: { handle },
    include: {
      tweets: {
        where: { postedAt: { gte: date, lte: endOfDay(date) } },
        orderBy: { postedAt: "asc" },
      },
      digests: { where: { date }, take: 1 },
    },
  })

  if (!account) notFound()

  const digest = account.digests[0]

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Back + header */}
      <div className="flex items-center gap-4">
        <Link
          href={`/dashboard?date=${dateStr}`}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="font-mono text-lg text-foreground">@{account.handle}</h1>
          <p className="font-mono text-xs text-muted-foreground tracking-wide">
            {format(date, "EEE, MMM d yyyy").toUpperCase()}
          </p>
        </div>
      </div>

      {/* Digest summary card */}
      {digest?.summary && (
        <Card>
          <CardContent className="pt-4 space-y-3">
            <p className="text-sm leading-relaxed text-foreground/80">{digest.summary}</p>
            <div className="flex flex-wrap items-center gap-2">
              {digest.sentiment && (
                <div className="flex items-center gap-1.5">
                  <div
                    className={`w-1.5 h-1.5 rounded-full ${sentimentDot[digest.sentiment] ?? "bg-border"}`}
                  />
                  <span
                    className={`font-mono text-xs ${sentimentLabel[digest.sentiment] ?? "text-muted-foreground"}`}
                  >
                    {digest.sentiment}
                  </span>
                </div>
              )}
              {digest.tickers.map((t: string) => (
                <TickerBadge
                  key={t}
                  ticker={t}
                  entry={(digest.tickerData as TickerData | null)?.[t]}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tweet list */}
      <div className="space-y-3">
        {account.tweets.length === 0 ? (
          <p className="text-muted-foreground text-sm font-mono">No tweets found for this date.</p>
        ) : (
          account.tweets.map((tweet: Tweet) => {
            const isKey = digest?.keyTweetIds.includes(tweet.tweetId)
            return (
              <Card
                key={tweet.id}
                className={isKey ? "border-l-2 border-l-green-500" : ""}
              >
                <CardContent className="pt-4 space-y-2">
                  <p className="text-sm leading-relaxed">{tweet.text}</p>
                  <div className="flex items-center gap-4 font-mono text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Heart className="h-3 w-3" /> {tweet.likesCount}
                    </span>
                    <span className="flex items-center gap-1">
                      <Repeat2 className="h-3 w-3" /> {tweet.retweetsCount}
                    </span>
                    <span>{format(tweet.postedAt, "h:mm a")}</span>
                    <a
                      href={tweet.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 hover:text-foreground ml-auto transition-colors"
                    >
                      View on X <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </CardContent>
              </Card>
            )
          })
        )}
      </div>
    </div>
  )
}
```

**Step 2: Verify build**

```bash
npm run build
```

**Step 3: Commit**

```bash
git add app/dashboard/[handle]/page.tsx
git commit -m "feat: restyle drill-down — mono type, green key-tweet border, dot sentiment"
```

---

## Task 8: Restyle login page

**Files:**
- Modify: `app/login/page.tsx`

**Step 1: Replace the wordmark section only**

Find this block:
```tsx
<div className="text-center mb-8">
  <h1 className="text-2xl font-bold tracking-tight">Market Digest</h1>
  <p className="text-sm text-muted-foreground mt-1">Daily summaries from the accounts that matter.</p>
</div>
```

Replace with:
```tsx
<div className="text-center mb-8">
  <h1 className="font-mono text-base tracking-widest uppercase text-foreground">Market Digest</h1>
  <p className="font-mono text-xs text-muted-foreground mt-2">Enter password to continue</p>
</div>
```

**Step 2: Verify build**

```bash
npm run build
```

**Step 3: Commit**

```bash
git add app/login/page.tsx
git commit -m "feat: restyle login page wordmark — mono uppercase"
```

---

## Task 9: Push and verify deploy

**Step 1: Push all commits**

```bash
cd /Users/openclaw/river-workspace/twitter-indicators && git push
```

**Step 2: Verify Vercel deploy**

```bash
vercel --prod 2>&1 | tail -5
```

Or just watch the auto-deploy trigger from the push. Check the Vercel dashboard for build success.

**Step 3: Smoke test**

Visit https://twitter-indicators.vercel.app and confirm:
- Dark slate background ✓
- Mono wordmark in nav ✓
- Tab-style category filter ✓
- Account cards have left-border sentiment accents ✓
- Handles in monospace ✓
- Sentiment shown as dot + label ✓
