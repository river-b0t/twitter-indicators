# Summary Box + Date Picker Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a category-level summary box above the account cards, a clickable date picker in the header, and fix two category label display names (Vc → Crypto VC, Tradfi → TradFi).

**Architecture:** Algorithmic aggregation — no new AI calls. The dashboard page already fetches all per-account DailyDigest records; pass them through a pure aggregation helper (`lib/summary.ts`) that computes overview text, per-ticker sentiment labels, and highlight excerpts. A new `SummaryBox` server component renders above the CategoryFilter tabs. A new `DatePicker` client component replaces the static date text and opens a shadcn Calendar popover on click.

**Tech Stack:** Next.js 16 App Router (server + client components), Prisma 7, shadcn/ui (Calendar, Popover), date-fns, TypeScript

**No test suite in this project — skip TDD steps, implement directly.**

---

## Task 1: Fix category label display names

**Files:**
- Modify: `components/category-filter.tsx`

**Step 1: Add a DISPLAY map and apply it**

In `components/category-filter.tsx`, add a display name map just below the CATEGORIES array. Replace the raw `{cat}` render with a lookup.

Replace the full file with:

```tsx
"use client"
import { useRouter, useSearchParams } from "next/navigation"

const CATEGORIES = ["all", "traders", "crypto", "onchain", "vc", "tradfi", "thematic", "builders"] as const

const DISPLAY: Partial<Record<typeof CATEGORIES[number], string>> = {
  vc: "Crypto VC",
  tradfi: "TradFi",
}

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
          {DISPLAY[cat] ?? cat}
        </button>
      ))}
    </div>
  )
}
```

Note: `capitalize` CSS is still applied but `DISPLAY[cat]` overrides the raw value for vc and tradfi. The explicit strings "Crypto VC" and "TradFi" have the correct casing so `capitalize` has no visible effect on them.

**Step 2: Verify build**

```bash
cd /Users/openclaw/river-workspace/twitter-indicators && npm run build
```

Expected: clean build.

**Step 3: Commit**

```bash
git add components/category-filter.tsx
git commit -m "fix: display 'Crypto VC' and 'TradFi' in category filter"
```

---

## Task 2: Create aggregation helper lib/summary.ts

**Files:**
- Create: `lib/summary.ts`

**Step 1: Create the file**

```ts
// lib/summary.ts
// Pure aggregation helper — no I/O, no async.
// Takes per-account digest data already fetched by the dashboard page.

import type { TickerData } from "@/lib/finnhub"

export interface DigestInput {
  summary: string | null
  sentiment: string | null
  tickers: string[]
  tickerData: TickerData | null
  account: { handle: string }
}

export interface TickerSummary {
  ticker: string
  price?: number
  change?: number
  resolved: boolean
  mentionCount: number
  sentimentLabel: string  // e.g. "bullish consensus (4 accounts)" or "3 bullish, 1 bearish"
}

export interface CategorySummary {
  completedCount: number
  overviewText: string
  tickers: TickerSummary[]  // sorted by mentionCount desc
  highlights: Array<{ handle: string; text: string }>
}

export function aggregateDigests(digests: DigestInput[]): CategorySummary {
  const completed = digests.filter((d) => d.sentiment !== null && d.summary !== null)

  if (completed.length === 0) {
    return { completedCount: 0, overviewText: "", tickers: [], highlights: [] }
  }

  // Sentiment distribution
  const dist: Record<string, number> = {}
  for (const d of completed) {
    if (d.sentiment) dist[d.sentiment] = (dist[d.sentiment] ?? 0) + 1
  }

  // Dominant sentiment
  const sorted = Object.entries(dist).sort((a, b) => b[1] - a[1])
  const [dominant, dominantCount] = sorted[0]
  const total = completed.length

  // 2-sentence overview
  const sentimentPhrase =
    dominantCount === total
      ? `${dominant} (${total}/${total})`
      : `predominantly ${dominant} (${dominantCount}/${total})`
  const overviewText = `${total} account${total === 1 ? "" : "s"} posting today. Sentiment is ${sentimentPhrase}.`

  // Ticker aggregation
  const tickerMentions: Record<string, {
    count: number
    sentiments: string[]
    price?: number
    change?: number
    resolved: boolean
  }> = {}

  for (const d of completed) {
    for (const t of d.tickers) {
      if (!tickerMentions[t]) {
        tickerMentions[t] = { count: 0, sentiments: [], resolved: false }
      }
      tickerMentions[t].count++
      if (d.sentiment) tickerMentions[t].sentiments.push(d.sentiment)
      // First resolved tickerData entry wins
      const entry = d.tickerData?.[t]
      if (!tickerMentions[t].resolved && entry?.resolved) {
        tickerMentions[t].price = entry.price
        tickerMentions[t].change = entry.change
        tickerMentions[t].resolved = true
      }
    }
  }

  const tickers: TickerSummary[] = Object.entries(tickerMentions)
    .sort((a, b) => b[1].count - a[1].count)
    .map(([ticker, info]) => ({
      ticker,
      price: info.price,
      change: info.change,
      resolved: info.resolved,
      mentionCount: info.count,
      sentimentLabel: buildSentimentLabel(info.sentiments, info.count),
    }))

  // Highlights: up to 2 accounts, first sentence of their summary
  const highlights = completed.slice(0, 2).map((d) => ({
    handle: d.account.handle,
    text: firstSentence(d.summary!),
  }))

  return { completedCount: total, overviewText, tickers, highlights }
}

function buildSentimentLabel(sentiments: string[], total: number): string {
  const dist: Record<string, number> = {}
  for (const s of sentiments) dist[s] = (dist[s] ?? 0) + 1

  const sorted = Object.entries(dist).sort((a, b) => b[1] - a[1])
  if (sorted.length === 0) return `${total} mention${total === 1 ? "" : "s"}`

  const [top, topCount] = sorted[0]
  if (topCount === total) return `${top} consensus (${total} account${total === 1 ? "" : "s"})`
  if (sorted.length === 1) return `${top} (${topCount}/${total})`

  const [second, secondCount] = sorted[1]
  return `${topCount} ${top}, ${secondCount} ${second}`
}

function firstSentence(text: string): string {
  const match = text.match(/^[^.!?]+[.!?]/)
  const sentence = match ? match[0].trim() : text
  return sentence.length > 140 ? sentence.slice(0, 140) + "..." : sentence
}
```

**Step 2: Verify build**

```bash
cd /Users/openclaw/river-workspace/twitter-indicators && npm run build
```

Expected: clean build.

**Step 3: Commit**

```bash
git add lib/summary.ts
git commit -m "feat: add aggregateDigests helper for category summary"
```

---

## Task 3: Create SummaryBox component

**Files:**
- Create: `components/summary-box.tsx`

**Step 1: Create the file**

```tsx
// components/summary-box.tsx
import type { CategorySummary } from "@/lib/summary"

function fmt(price?: number): string {
  if (!price) return ""
  return price >= 1000
    ? `$${price.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
    : `$${price.toFixed(2)}`
}

function fmtChange(change?: number): string {
  if (change === undefined) return ""
  const sign = change >= 0 ? "+" : ""
  return `${sign}${change}%`
}

export function SummaryBox({ summary }: { summary: CategorySummary }) {
  if (summary.completedCount === 0) return null

  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-3">
      {/* Overview */}
      <p className="text-sm leading-relaxed text-foreground/80">{summary.overviewText}</p>

      {/* Tickers */}
      {summary.tickers.length > 0 && (
        <div className="space-y-1.5">
          {summary.tickers.map((t) => (
            <div key={t.ticker} className="flex items-baseline gap-2 font-mono text-xs">
              <span className="text-foreground w-12 shrink-0">{t.ticker}</span>
              {t.resolved && (
                <span className="text-foreground/60 w-20 shrink-0">{fmt(t.price)}</span>
              )}
              {t.resolved && t.change !== undefined && (
                <span className={`w-14 shrink-0 ${t.change >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {fmtChange(t.change)}
                </span>
              )}
              <span className="text-muted-foreground">— {t.sentimentLabel}</span>
            </div>
          ))}
        </div>
      )}

      {/* Highlights */}
      {summary.highlights.length > 0 && (
        <div className="space-y-1 pt-2 border-t border-border/50">
          {summary.highlights.map((h) => (
            <p key={h.handle} className="text-xs text-muted-foreground leading-relaxed">
              <span className="font-mono text-foreground/60">@{h.handle}</span>
              {" — "}{h.text}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
```

**Step 2: Verify build**

```bash
cd /Users/openclaw/river-workspace/twitter-indicators && npm run build
```

Expected: clean build.

**Step 3: Commit**

```bash
git add components/summary-box.tsx
git commit -m "feat: add SummaryBox component for category digest overview"
```

---

## Task 4: Create DatePicker component

**Files:**
- Create: `components/date-picker.tsx`

**Step 1: Check if shadcn Calendar and Popover are installed**

```bash
ls /Users/openclaw/river-workspace/twitter-indicators/components/ui/calendar.tsx 2>/dev/null && echo "exists" || echo "missing"
ls /Users/openclaw/river-workspace/twitter-indicators/components/ui/popover.tsx 2>/dev/null && echo "exists" || echo "missing"
```

If either is missing, install it:

```bash
cd /Users/openclaw/river-workspace/twitter-indicators
npx shadcn@latest add calendar popover --yes
```

Expected: components added to `components/ui/`.

**Step 2: Create the DatePicker component**

```tsx
// components/date-picker.tsx
"use client"
import { useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"
import { format, parseISO } from "date-fns"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

export function DatePicker({ dateStr }: { dateStr: string }) {
  const router = useRouter()
  const params = useSearchParams()
  const [open, setOpen] = useState(false)

  const date = parseISO(dateStr)

  function handleSelect(selected: Date | undefined) {
    if (!selected) return
    const p = new URLSearchParams(params.toString())
    p.set("date", format(selected, "yyyy-MM-dd"))
    router.push(`/dashboard?${p.toString()}`)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="font-mono text-xs text-muted-foreground tracking-wide hover:text-foreground transition-colors cursor-pointer">
          {format(date, "EEE, MMM d yyyy").toUpperCase()}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={handleSelect}
          toDate={new Date()}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  )
}
```

**Step 3: Verify build**

```bash
cd /Users/openclaw/river-workspace/twitter-indicators && npm run build
```

Expected: clean build.

**Step 4: Commit**

```bash
git add components/date-picker.tsx components/ui/calendar.tsx components/ui/popover.tsx
git commit -m "feat: add DatePicker component with shadcn Calendar popover"
```

(Only include the ui/ files in the commit if they were newly installed.)

---

## Task 5: Wire SummaryBox and DatePicker into the dashboard page

**Files:**
- Modify: `app/dashboard/page.tsx`

**Step 1: Replace the full file**

```tsx
import { prisma } from "@/lib/prisma"
import { AccountCard } from "@/components/account-card"
import { CategoryFilter } from "@/components/category-filter"
import { RefreshButton } from "@/components/refresh-button"
import { SummaryBox } from "@/components/summary-box"
import { DatePicker } from "@/components/date-picker"
import { format, startOfDay, parseISO } from "date-fns"
import { Suspense } from "react"
import type { TickerData } from "@/lib/finnhub"
import { aggregateDigests } from "@/lib/summary"

interface Props {
  searchParams: Promise<{ date?: string; category?: string }>
}

export default async function DashboardPage({ searchParams }: Props) {
  const { date: dateParam, category: categoryParam } = await searchParams
  const dateStr = dateParam ?? format(new Date(), "yyyy-MM-dd")
  const date = startOfDay(parseISO(dateStr))   // parseISO avoids UTC-vs-local issue
  const category = categoryParam ?? "all"

  const accounts = await prisma.twitterAccount.findMany({
    where: {
      active: true,
      ...(category !== "all" ? { categories: { hasSome: [category] } } : {}),
    },
    include: {
      digests: { where: { date }, take: 1 },
      tweets: { where: { postedAt: { gte: date } }, select: { id: true } },
    },
    orderBy: { handle: "asc" },
  })

  // Build category summary from fetched digests (no extra query needed)
  const digestInputs = accounts.map((a) => ({
    summary: a.digests[0]?.summary ?? null,
    sentiment: (a.digests[0]?.sentiment as string | null) ?? null,
    tickers: a.digests[0]?.tickers ?? [],
    tickerData: (a.digests[0]?.tickerData as TickerData | null) ?? null,
    account: { handle: a.handle },
  }))
  const categorySummary = aggregateDigests(digestInputs)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Suspense
          fallback={
            <p className="font-mono text-xs text-muted-foreground tracking-wide">
              {format(date, "EEE, MMM d yyyy").toUpperCase()}
            </p>
          }
        >
          <DatePicker dateStr={dateStr} />
        </Suspense>
        <RefreshButton />
      </div>

      <SummaryBox summary={categorySummary} />

      <Suspense>
        <CategoryFilter active={category} />
      </Suspense>

      {accounts.length === 0 ? (
        <p className="text-muted-foreground text-sm">No accounts found. Add some in Settings.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.map((account) => {
            const digest = account.digests[0]
            return (
              <AccountCard
                key={account.id}
                handle={account.handle}
                displayName={account.displayName}
                categories={account.categories}
                summary={digest?.summary ?? null}
                sentiment={digest?.sentiment ?? null}
                tickers={digest?.tickers ?? []}
                tickerData={digest?.tickerData as TickerData | null}
                tweetCount={account.tweets.length}
                date={dateStr}
                status={digest?.status ?? "pending"}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
```

**Step 2: Verify build**

```bash
cd /Users/openclaw/river-workspace/twitter-indicators && npm run build
```

Expected: clean build, all pages generate without error.

**Step 3: Commit**

```bash
git add app/dashboard/page.tsx
git commit -m "feat: wire SummaryBox and DatePicker into dashboard; fix parseISO date parsing"
```

---

## Task 6: Push and deploy

**Step 1: Push**

```bash
cd /Users/openclaw/river-workspace/twitter-indicators && git push
```

**Step 2: Deploy**

```bash
vercel --prod 2>&1 | tail -5
```

**Step 3: Smoke test**

Visit https://notis.wallyhansen.com and confirm:
- Date in header is clickable and opens a calendar ✓
- Selecting a past date loads that day's data ✓
- Summary box appears above the filter tabs ✓
- Category tabs show "Crypto VC" and "TradFi" ✓
- Summary box updates when switching categories ✓

---

## Unresolved Questions

None.
