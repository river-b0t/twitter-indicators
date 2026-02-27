# Ticker Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enrich extracted tickers with Finnhub price + daily % change, snapshotted during the digest pipeline and displayed in the dashboard, drill-down page, and email.

**Architecture:** Add `tickerData Json?` to `DailyDigest`. After Gemini extracts tickers during the pipeline, call Finnhub `/quote` per ticker and store the result as JSON. UI reads the JSON to show enriched badges; unresolved tickers show a `?` indicator.

**Tech Stack:** Prisma 7, Next.js 16, Finnhub REST API (free tier), React Email, TypeScript

---

## Task 1: Add `tickerData` field to Prisma schema

**Files:**
- Modify: `prisma/schema.prisma`

**Step 1: Add the field to DailyDigest**

In `prisma/schema.prisma`, add `tickerData Json?` to the `DailyDigest` model after the `tickers` field:

```prisma
model DailyDigest {
  id          String         @id @default(cuid())
  accountId   String
  account     TwitterAccount @relation(fields: [accountId], references: [id], onDelete: Cascade)
  date        DateTime       @db.Date
  summary     String?
  sentiment   Sentiment?
  tickers     String[]
  tickerData  Json?          // { BTC: { price: 94000, change: 2.4, resolved: true } }
  keyTweetIds String[]
  status      DigestStatus   @default(pending)
  createdAt   DateTime       @default(now())
  updatedAt   DateTime       @updatedAt

  @@unique([accountId, date])
}
```

**Step 2: Create and run the migration**

This project can't run `migrate dev` locally (P1017 connection error). Use this approach:

```bash
# Pull prod env
vercel env pull /tmp/vercel-prod.env --environment production

# Run migrate deploy against prod DB
DATABASE_URL=$(grep ^DATABASE_URL /tmp/vercel-prod.env | cut -d= -f2-) \
  npx prisma migrate dev --name add_ticker_data --create-only
```

If `--create-only` still fails without a DB connection, manually create the migration:

```bash
mkdir -p prisma/migrations/20260227_add_ticker_data
cat > prisma/migrations/20260227_add_ticker_data/migration.sql << 'EOF'
ALTER TABLE "DailyDigest" ADD COLUMN "tickerData" JSONB;
EOF
```

Then deploy:
```bash
DATABASE_URL=$(grep ^DATABASE_URL /tmp/vercel-prod.env | cut -d= -f2-) \
  npx prisma migrate deploy
```

**Step 3: Regenerate Prisma client**

```bash
npx prisma generate
```

Expected: `✔ Generated Prisma Client`

**Step 4: Verify build still passes**

```bash
npm run build
```

Expected: no type errors.

**Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add tickerData Json field to DailyDigest"
```

---

## Task 2: Create `lib/finnhub.ts`

**Files:**
- Create: `lib/finnhub.ts`

**Step 1: Create the file**

```typescript
// lib/finnhub.ts

export interface TickerEntry {
  price?: number
  change?: number   // daily % change, e.g. 2.4 means +2.4%
  resolved: boolean
}

export type TickerData = Record<string, TickerEntry>

/**
 * Fetch price + daily % change for an array of tickers from Finnhub.
 * Unresolvable tickers (unknown symbol, API error) return { resolved: false }.
 * Never throws — pipeline failure tolerance.
 */
export async function fetchTickerPrices(tickers: string[]): Promise<TickerData> {
  if (tickers.length === 0) return {}

  const apiKey = process.env.FINNHUB_API_KEY
  if (!apiKey) {
    console.warn("[finnhub] FINNHUB_API_KEY not set, skipping price fetch")
    return Object.fromEntries(tickers.map((t) => [t, { resolved: false }]))
  }

  const results = await Promise.allSettled(
    tickers.map((ticker) => fetchOne(ticker, apiKey))
  )

  const data: TickerData = {}
  for (let i = 0; i < tickers.length; i++) {
    const r = results[i]
    data[tickers[i]] =
      r.status === "fulfilled"
        ? r.value
        : { resolved: false }
  }
  return data
}

async function fetchOne(ticker: string, apiKey: string): Promise<TickerEntry> {
  const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(ticker)}&token=${apiKey}`
  const res = await fetch(url, { next: { revalidate: 0 } })

  if (!res.ok) return { resolved: false }

  const json = await res.json() as { c: number; dp: number }

  // Finnhub returns c=0 when symbol is unknown
  if (!json.c) return { resolved: false }

  return {
    price: json.c,
    change: Math.round(json.dp * 100) / 100,  // 2 decimal places
    resolved: true,
  }
}
```

**Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

**Step 3: Commit**

```bash
git add lib/finnhub.ts
git commit -m "feat: add Finnhub ticker price fetcher"
```

---

## Task 3: Wire Finnhub into the digest pipeline

**Files:**
- Modify: `lib/pipeline.ts`

**Step 1: Import and call `fetchTickerPrices` after Gemini summarization**

In `lib/pipeline.ts`, add the import at the top:

```typescript
import { fetchTickerPrices } from "./finnhub"
```

In the `processAccount` function, replace the final `prisma.dailyDigest.update` call with this:

```typescript
  // Fetch ticker prices
  let tickerData = {}
  if (digestResult.tickers.length > 0) {
    try {
      tickerData = await fetchTickerPrices(digestResult.tickers)
    } catch (err) {
      console.warn(`[pipeline] ticker price fetch failed for ${account.handle}:`, err)
    }
  }

  // Save digest
  await prisma.dailyDigest.update({
    where: { accountId_date: { accountId: account.id, date } },
    data: {
      summary: digestResult.summary,
      sentiment: digestResult.sentiment,
      tickers: digestResult.tickers,
      tickerData,
      keyTweetIds: digestResult.keyTweetIds,
      status: "complete",
    },
  })
```

**Step 2: Verify build**

```bash
npm run build
```

Expected: no errors.

**Step 3: Commit**

```bash
git add lib/pipeline.ts
git commit -m "feat: fetch Finnhub ticker prices during digest pipeline"
```

---

## Task 4: Create shared `TickerBadge` component

This component is used by both the AccountCard and drill-down page, so extract it once.

**Files:**
- Create: `components/ticker-badge.tsx`

**Step 1: Create the component**

```typescript
// components/ticker-badge.tsx
import { Badge } from "@/components/ui/badge"
import type { TickerEntry } from "@/lib/finnhub"

interface TickerBadgeProps {
  ticker: string
  entry?: TickerEntry
}

function formatPrice(price: number): string {
  if (price >= 1000) return `$${price.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
  if (price >= 1) return `$${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  return `$${price.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`
}

export function TickerBadge({ ticker, entry }: TickerBadgeProps) {
  // No price data — plain badge
  if (!entry) {
    return <Badge variant="outline" className="text-xs">{ticker}</Badge>
  }

  // Unresolved — show with ? indicator
  if (!entry.resolved) {
    return (
      <Badge variant="outline" className="text-xs text-muted-foreground">
        {ticker} ?
      </Badge>
    )
  }

  // Resolved — show price and % change
  const changePositive = (entry.change ?? 0) >= 0
  const changeColor = changePositive ? "text-green-600" : "text-red-600"
  const changePrefix = changePositive ? "+" : ""

  return (
    <Badge variant="outline" className="text-xs gap-1">
      <span>{ticker}</span>
      {entry.price !== undefined && (
        <span className="text-muted-foreground">{formatPrice(entry.price)}</span>
      )}
      {entry.change !== undefined && (
        <span className={changeColor}>
          ({changePrefix}{entry.change}%)
        </span>
      )}
    </Badge>
  )
}
```

**Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add components/ticker-badge.tsx
git commit -m "feat: add TickerBadge component with price + % change display"
```

---

## Task 5: Update `AccountCard` to use enriched ticker badges

**Files:**
- Modify: `components/account-card.tsx`

**Step 1: Update the component**

Replace the contents of `components/account-card.tsx`:

```typescript
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { TickerBadge } from "@/components/ticker-badge"
import Link from "next/link"
import type { TickerData } from "@/lib/finnhub"

const sentimentColors = {
  bullish: "bg-green-100 text-green-800",
  bearish: "bg-red-100 text-red-800",
  neutral: "bg-gray-100 text-gray-800",
  mixed: "bg-yellow-100 text-yellow-800",
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
  handle, displayName, categories, summary, sentiment, tickers, tickerData, tweetCount, date, status
}: AccountCardProps) {
  return (
    <Link href={`/dashboard/${handle}?date=${date}`}>
      <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-sm">@{handle}</p>
              <p className="text-xs text-muted-foreground">{displayName}</p>
            </div>
            {sentiment && (
              <Badge className={sentimentColors[sentiment as keyof typeof sentimentColors] ?? ""}>
                {sentiment}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {status === "failed" ? (
            <p className="text-sm text-muted-foreground italic">Digest unavailable</p>
          ) : status === "pending" ? (
            <p className="text-sm text-muted-foreground italic">Processing...</p>
          ) : (
            <p className="text-sm leading-relaxed">{summary}</p>
          )}
          {tickers.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {tickers.map((t) => (
                <TickerBadge
                  key={t}
                  ticker={t}
                  entry={tickerData?.[t]}
                />
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground">{tweetCount} tweets today</p>
        </CardContent>
      </Card>
    </Link>
  )
}
```

**Step 2: Find and update the dashboard page that passes props to AccountCard**

Open `app/dashboard/page.tsx`. Find where AccountCard is rendered and add the `tickerData` prop:

```typescript
// In the query, make sure tickerData is selected (it will be by default with findMany)
// When rendering AccountCard, add:
tickerData={digest?.tickerData as TickerData | null}
```

Note: `tickerData` comes from `DailyDigest` as `Prisma.JsonValue`. Cast it: `digest?.tickerData as TickerData | null`. Add the import: `import type { TickerData } from "@/lib/finnhub"`.

**Step 3: Verify build**

```bash
npm run build
```

**Step 4: Commit**

```bash
git add components/account-card.tsx app/dashboard/page.tsx
git commit -m "feat: show enriched ticker prices on account cards"
```

---

## Task 6: Update drill-down page for enriched ticker section

**Files:**
- Modify: `app/dashboard/[handle]/page.tsx`

**Step 1: Replace the ticker badges section**

Add the import at the top of the file:
```typescript
import { TickerBadge } from "@/components/ticker-badge"
import type { TickerData } from "@/lib/finnhub"
```

Find this block in the drill-down page:
```typescript
<div className="flex gap-2">
  {digest.sentiment && <Badge>{digest.sentiment}</Badge>}
  {digest.tickers.map((t: string) => (
    <Badge key={t} variant="outline">{t}</Badge>
  ))}
</div>
```

Replace with:
```typescript
<div className="flex flex-wrap gap-2">
  {digest.sentiment && <Badge>{digest.sentiment}</Badge>}
  {digest.tickers.map((t: string) => (
    <TickerBadge
      key={t}
      ticker={t}
      entry={(digest.tickerData as TickerData | null)?.[t]}
    />
  ))}
</div>
```

**Step 2: Verify build**

```bash
npm run build
```

**Step 3: Commit**

```bash
git add app/dashboard/[handle]/page.tsx
git commit -m "feat: show enriched ticker prices on drill-down page"
```

---

## Task 7: Update email template for enriched tickers

**Files:**
- Modify: `emails/digest.tsx`
- Modify: `lib/email.ts`

**Step 1: Update the `AccountDigest` interface in `emails/digest.tsx`**

Add `tickerData` to the interface:
```typescript
interface AccountDigest {
  handle: string
  displayName: string
  categories: string[]
  summary: string
  sentiment: string
  tickers: string[]
  tickerData?: Record<string, { price?: number; change?: number; resolved: boolean }>
}
```

**Step 2: Update the ticker display in `emails/digest.tsx`**

Find this line:
```typescript
{d.tickers.length > 0 && ` · ${d.tickers.join(", ")}`}
```

Replace with a helper that formats enriched tickers:
```typescript
{d.tickers.length > 0 && ` · ${d.tickers.map((t) => {
  const entry = d.tickerData?.[t]
  if (!entry?.resolved || !entry.price) return t
  const sign = (entry.change ?? 0) >= 0 ? "+" : ""
  return `${t} $${entry.price.toLocaleString("en-US", { maximumFractionDigits: 0 })} (${sign}${entry.change}%)`
}).join(", ")}`}
```

**Step 3: Update `lib/email.ts` to pass `tickerData` in the payload**

Open `lib/email.ts`. Find where `emailPayload` is built in `pipeline.ts` (the email payload array). In `lib/pipeline.ts`, update the emailPayload mapping:

```typescript
const emailPayload = completedDigests.map((d) => ({
  handle: d.account.handle,
  displayName: d.account.displayName,
  categories: d.account.categories,
  summary: d.summary!,
  sentiment: d.sentiment!,
  tickers: d.tickers,
  tickerData: d.tickerData as Record<string, { price?: number; change?: number; resolved: boolean }> | undefined,
}))
```

**Step 4: Verify build**

```bash
npm run build
```

**Step 5: Commit**

```bash
git add emails/digest.tsx lib/pipeline.ts
git commit -m "feat: include ticker prices in daily digest email"
```

---

## Task 8: Add env var and deploy

**Files:**
- Create: `.env.example`

**Step 1: Create `.env.example`**

```bash
# .env.example
DATABASE_URL=postgresql://...
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000
GEMINI_API_KEY=
FINNHUB_API_KEY=
TWITTER_COOKIES=[]
CRON_SECRET=
RESEND_API_KEY=
```

**Step 2: Add FINNHUB_API_KEY to Vercel**

Get a free API key from https://finnhub.io (no credit card required). Then:

```bash
vercel env add FINNHUB_API_KEY production
```

Or add via Vercel dashboard → Project Settings → Environment Variables.

**Step 3: Deploy**

```bash
git push
```

Vercel will auto-deploy. Verify the deploy succeeds in the Vercel dashboard.

**Step 4: Test via manual digest run**

```bash
curl -X POST https://twitter-indicators.vercel.app/api/digest/run \
  -H "Authorization: Bearer $CRON_SECRET"
```

Check the response — `batch` results should show completed accounts. Then visit the dashboard and confirm tickers show prices.

**Step 5: Commit .env.example**

```bash
git add .env.example
git commit -m "chore: add .env.example with FINNHUB_API_KEY"
git push
```
