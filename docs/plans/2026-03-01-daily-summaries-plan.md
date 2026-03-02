# Daily Summaries Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Generate tier-weighted per-category and global AI summaries once per day at email-send time, store them in a new `DailySummary` table, surface them in a collapsible dashboard panel, and include them in the daily email.

**Architecture:** New `lib/summarizer.ts` module calls Gemini once per active category (1-2 paragraph synthesis, tier-weighted) plus once for the global top-10 ticker consensus. Results stored in `DailySummary` table (one row per `date+scope`). Dashboard renders a new `DailySummaryPanel` server component above account cards. Email template gains global + category sections at top.

**Tech Stack:** Prisma 7 (PostgreSQL/Neon), `@google/generative-ai` (gemini-2.5-flash), Next.js 16 App Router server components, React Email, TypeScript strict

---

## Task 1: DB schema — add `DailySummary` model

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260301_add_daily_summary/migration.sql`

**Step 1: Add model to schema**

In `prisma/schema.prisma`, append after the `DigestEmail` model (line ~80):

```prisma
model DailySummary {
  id      String   @id @default(cuid())
  date    DateTime @db.Date
  scope   String   // category slug ("traders","crypto",etc.) or "global"
  content Json
  @@unique([date, scope])
}
```

**Step 2: Write migration SQL**

Create `prisma/migrations/20260301_add_daily_summary/migration.sql`:

```sql
CREATE TABLE "DailySummary" (
  "id"      TEXT NOT NULL,
  "date"    DATE NOT NULL,
  "scope"   TEXT NOT NULL,
  "content" JSONB NOT NULL,
  CONSTRAINT "DailySummary_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DailySummary_date_scope_key" ON "DailySummary"("date", "scope");
```

**Step 3: Apply migration to prod**

```bash
cd /Users/openclaw/river-workspace/twitter-indicators
DIRECT_URL="postgresql://neondb_owner:REDACTED@ep-orange-shape-aiunslph.c-4.us-east-1.aws.neon.tech/neondb?connect_timeout=10&sslmode=require" \
DATABASE_URL="$DIRECT_URL" npx prisma migrate deploy
```

Expected: `1 migration applied`

**Step 4: Regenerate Prisma client**

```bash
npx prisma generate
```

**Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260301_add_daily_summary/
git commit -m "feat: add DailySummary schema and migration"
```

---

## Task 2: `lib/summarizer.ts` — core generation logic

**Files:**
- Create: `lib/summarizer.ts`

**Step 1: Write the file**

```typescript
// lib/summarizer.ts
import { prisma } from "./prisma"
import { GoogleGenerativeAI } from "@google/generative-ai"

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" })

const CATEGORIES = ["traders", "crypto", "onchain", "vc", "tradfi", "thematic", "builders"] as const

const TIER_WEIGHT: Record<number, number> = { 1: 3, 2: 2, 3: 1 }

function tierWeight(tierMap: unknown, category: string): number {
  if (!tierMap || typeof tierMap !== "object" || Array.isArray(tierMap)) return 1
  const t = (tierMap as Record<string, number>)[category]
  return TIER_WEIGHT[t] ?? 1
}

function bestTierWeight(tierMap: unknown, categories: string[]): number {
  if (!categories.length) return 1
  return Math.max(...categories.map((c) => tierWeight(tierMap, c)))
}

function parseGeminiJson<T>(text: string): T {
  const cleaned = text.trim().replace(/^```json?\n?/, "").replace(/\n?```$/, "")
  return JSON.parse(cleaned) as T
}

export interface TickerConsensus {
  ticker: string
  weightedMentions: number
  consensus: string
  contrarian?: string
}

export interface CategorySummaryContent {
  text: string
  tickers: TickerConsensus[]
}

export interface GlobalSummaryContent {
  tickers: TickerConsensus[]
}

export async function generateDailySummaries(date: Date): Promise<void> {
  const digests = await prisma.dailyDigest.findMany({
    where: { date, status: "complete" },
    include: { account: true },
  })

  if (digests.length === 0) return

  // Generate per-category summaries in parallel
  await Promise.allSettled(
    CATEGORIES.map((cat) => generateCategorySummary(date, cat, digests))
  )

  // Generate global summary after categories
  await generateGlobalSummary(date, digests).catch((err) =>
    console.error("[summarizer] global summary failed:", err)
  )
}

async function generateCategorySummary(
  date: Date,
  category: string,
  allDigests: Awaited<ReturnType<typeof prisma.dailyDigest.findMany<{ include: { account: true } }>>>
) {
  const catDigests = allDigests.filter((d) => d.account.categories.includes(category))
  if (catDigests.length === 0) return

  // Sort by tier weight desc (tier 1 first)
  const sorted = [...catDigests].sort((a, b) =>
    tierWeight(b.account.tierMap, category) - tierWeight(a.account.tierMap, category)
  )

  const accountLines = sorted.map((d) => {
    const t = (d.account.tierMap as Record<string, number>)?.[category] ?? 2
    return `[Tier ${t}] @${d.account.handle}: ${d.summary}\nTickers: ${d.tickers.join(", ") || "none"}`
  }).join("\n\n")

  const prompt = `You are synthesizing what financial Twitter accounts in the "${category}" category are saying today.
Accounts are listed by tier (tier 1 = highest signal, weight most heavily).

${accountLines}

Write a 1-2 paragraph synthesis that captures key themes and views, calls out specific tickers and the prevailing view on each, and weights tier 1 accounts more heavily than tier 2/3.

Then respond with JSON only (no markdown):
{"text":"...","tickers":[{"ticker":"BTC","weightedMentions":5,"consensus":"bullish — breakout likely","contrarian":"@handle sees rejection at resistance"}]}

Only include contrarian if a named account clearly contradicts the consensus. weightedMentions is approximate.`

  try {
    const result = await model.generateContent(prompt)
    const content = parseGeminiJson<CategorySummaryContent>(result.response.text())

    await prisma.dailySummary.upsert({
      where: { date_scope: { date, scope: category } },
      create: { date, scope: category, content: content as object },
      update: { content: content as object },
    })
    console.log(`[summarizer] ${category} summary done`)
  } catch (err) {
    console.error(`[summarizer] ${category} failed:`, err)
  }
}

async function generateGlobalSummary(
  date: Date,
  allDigests: Awaited<ReturnType<typeof prisma.dailyDigest.findMany<{ include: { account: true } }>>>
) {
  // Weighted ticker mention counts
  const tickerWeights: Record<string, { weight: number; accountSummaries: string[] }> = {}

  for (const d of allDigests) {
    const w = bestTierWeight(d.account.tierMap, d.account.categories)
    for (const ticker of d.tickers) {
      if (!tickerWeights[ticker]) tickerWeights[ticker] = { weight: 0, accountSummaries: [] }
      tickerWeights[ticker].weight += w
      tickerWeights[ticker].accountSummaries.push(`@${d.account.handle}: ${d.summary}`)
    }
  }

  const top10 = Object.entries(tickerWeights)
    .sort((a, b) => b[1].weight - a[1].weight)
    .slice(0, 10)

  if (top10.length === 0) return

  const tickerBlocks = top10.map(([ticker, info]) => {
    const summaries = info.accountSummaries.slice(0, 6).join("\n")
    return `${ticker} (weighted mentions: ${info.weight}):\n${summaries}`
  }).join("\n\n---\n\n")

  const prompt = `For each of the following tickers/assets, summarize the consensus view from financial Twitter today and flag any notable contrarian take.

${tickerBlocks}

Respond with JSON only (no markdown):
{"tickers":[{"ticker":"BTC","weightedMentions":14,"consensus":"one-liner consensus view","contrarian":"optional contrarian note, omit key if none"}]}

Keep each consensus to one sentence. Only include contrarian if clearly present.`

  const result = await model.generateContent(prompt)
  const content = parseGeminiJson<GlobalSummaryContent>(result.response.text())

  await prisma.dailySummary.upsert({
    where: { date_scope: { date, scope: "global" } },
    create: { date, scope: "global", content: content as object },
    update: { content: content as object },
  })
  console.log("[summarizer] global summary done")
}
```

**Step 2: Commit**

```bash
git add lib/summarizer.ts
git commit -m "feat: add daily summary generator (per-category + global)"
```

---

## Task 3: Wire summarizer into pipeline

**Files:**
- Modify: `lib/pipeline.ts`

**Step 1: Find both email-send blocks**

There are two places in `lib/pipeline.ts` where `sendDailyDigestEmail` is called and `DigestEmail` is created with status `"sent"`:
1. The no-op path (~line 60-71)
2. The post-batch path (~line 97-119)

**Step 2: Add summarizer call after each successful email send**

In both locations, after `await prisma.digestEmail.create({ data: { ..., status: "sent" } })`, add:

```typescript
// Generate daily summaries (non-blocking, errors don't affect email status)
import("./summarizer").then(({ generateDailySummaries }) =>
  generateDailySummaries(targetDate).catch((err) =>
    console.error("[pipeline] summarizer failed:", err)
  )
)
```

Because `lib/pipeline.ts` already uses dynamic imports for `./email`, use the same pattern here to avoid circular deps.

**Step 3: Verify build**

```bash
npm run build 2>&1 | tail -20
```

Expected: no TypeScript errors

**Step 4: Commit**

```bash
git add lib/pipeline.ts
git commit -m "feat: trigger daily summaries after email send"
```

---

## Task 4: Dashboard panel — `components/DailySummaryPanel.tsx`

**Files:**
- Create: `components/DailySummaryPanel.tsx`

**Step 1: Write the component**

```typescript
// components/DailySummaryPanel.tsx
import { prisma } from "@/lib/prisma"
import type { CategorySummaryContent, GlobalSummaryContent, TickerConsensus } from "@/lib/summarizer"

const CATEGORIES = ["traders", "crypto", "onchain", "vc", "tradfi", "thematic", "builders"] as const
const DISPLAY: Record<string, string> = {
  traders: "Traders", crypto: "Crypto", onchain: "Onchain",
  vc: "VC", tradfi: "TradFi", thematic: "Thematic", builders: "Builders",
}

function fmtMentions(n: number) {
  return `${n} ref${n === 1 ? "" : "s"}`
}

function TickerRow({ t }: { t: TickerConsensus }) {
  return (
    <div className="py-1.5 border-b border-border/40 last:border-0">
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-xs text-foreground w-14 shrink-0">{t.ticker}</span>
        <span className="text-xs text-muted-foreground w-16 shrink-0">{fmtMentions(t.weightedMentions)}</span>
        <span className="text-xs text-foreground/80 leading-relaxed">{t.consensus}</span>
      </div>
      {t.contrarian && (
        <p className="text-xs text-amber-400/80 ml-[7.5rem] mt-0.5 leading-relaxed">
          ⚠ {t.contrarian}
        </p>
      )}
    </div>
  )
}

interface Props {
  date: Date
  activeCategoryFilter: string  // "all" or a category slug
}

export async function DailySummaryPanel({ date, activeCategoryFilter }: Props) {
  const summaries = await prisma.dailySummary.findMany({
    where: { date },
  })

  if (summaries.length === 0) return null

  const globalRow = summaries.find((s) => s.scope === "global")
  const categoryRows = CATEGORIES
    .map((cat) => ({ cat, row: summaries.find((s) => s.scope === cat) }))
    .filter((x) => x.row != null)

  if (!globalRow && categoryRows.length === 0) return null

  const global = globalRow?.content as GlobalSummaryContent | undefined
  const focusedCategory = activeCategoryFilter !== "all"
    ? categoryRows.find((x) => x.cat === activeCategoryFilter)
    : null

  return (
    <details open className="bg-card border border-border rounded-lg overflow-hidden">
      <summary className="px-4 py-3 cursor-pointer font-mono text-xs tracking-widest uppercase text-muted-foreground hover:text-foreground transition-colors select-none list-none flex items-center justify-between">
        <span>Market Overview</span>
        <span className="text-[10px]">▼</span>
      </summary>

      <div className="px-4 pb-4 space-y-4">
        {/* If filtered to a category, show that category's summary prominently */}
        {focusedCategory?.row && (
          <div className="space-y-2">
            <p className="font-mono text-xs tracking-widest uppercase text-muted-foreground">
              {DISPLAY[focusedCategory.cat]}
            </p>
            {(() => {
              const c = focusedCategory.row!.content as CategorySummaryContent
              return (
                <>
                  <p className="text-sm leading-relaxed text-foreground/80">{c.text}</p>
                  {c.tickers?.length > 0 && (
                    <div className="mt-2">
                      {c.tickers.map((t) => <TickerRow key={t.ticker} t={t} />)}
                    </div>
                  )}
                </>
              )
            })()}
          </div>
        )}

        {/* Global top-10 */}
        {global && (
          <div className="space-y-1">
            <p className="font-mono text-xs tracking-widest uppercase text-muted-foreground">Top References</p>
            <div>
              {global.tickers.map((t) => <TickerRow key={t.ticker} t={t} />)}
            </div>
          </div>
        )}

        {/* Per-category (show all when filter=all, hide focused one since shown above) */}
        {activeCategoryFilter === "all" && categoryRows.length > 0 && (
          <div className="space-y-3">
            <p className="font-mono text-xs tracking-widest uppercase text-muted-foreground">By Category</p>
            <div className="flex flex-wrap gap-2">
              {/* Category pills rendered as nested <details> */}
              {categoryRows.map(({ cat, row }) => {
                const c = row!.content as CategorySummaryContent
                return (
                  <details key={cat} className="w-full">
                    <summary className="cursor-pointer text-xs font-mono uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors list-none">
                      ▶ {DISPLAY[cat]}
                    </summary>
                    <div className="mt-2 pl-3 border-l border-border/50 space-y-2">
                      <p className="text-sm leading-relaxed text-foreground/80">{c.text}</p>
                      {c.tickers?.length > 0 && (
                        <div>
                          {c.tickers.map((t) => <TickerRow key={t.ticker} t={t} />)}
                        </div>
                      )}
                    </div>
                  </details>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </details>
  )
}
```

**Step 2: Commit**

```bash
git add components/DailySummaryPanel.tsx
git commit -m "feat: add DailySummaryPanel component"
```

---

## Task 5: Wire panel into dashboard page

**Files:**
- Modify: `app/dashboard/page.tsx`

**Step 1: Add import**

At the top of `app/dashboard/page.tsx`, add:

```typescript
import { DailySummaryPanel } from "@/components/DailySummaryPanel"
```

**Step 2: Insert panel between date row and SummaryBox**

Replace:
```typescript
      <SummaryBox summary={categorySummary} />

      <div className="flex items-center gap-4 flex-wrap">
```

With:
```typescript
      <Suspense>
        <DailySummaryPanel date={date} activeCategoryFilter={category} />
      </Suspense>

      <SummaryBox summary={categorySummary} />

      <div className="flex items-center gap-4 flex-wrap">
```

**Step 3: Build and verify**

```bash
npm run build 2>&1 | tail -20
```

Expected: clean build

**Step 4: Commit**

```bash
git add app/dashboard/page.tsx
git commit -m "feat: render DailySummaryPanel on dashboard"
```

---

## Task 6: Email template — add summaries sections

**Files:**
- Modify: `lib/email.ts`
- Modify: `emails/digest.tsx`

**Step 1: Update `sendDailyDigestEmail` signature in `lib/email.ts`**

Add `summaries` param:

```typescript
import type { CategorySummaryContent, GlobalSummaryContent } from "./summarizer"

export async function sendDailyDigestEmail(
  date: Date,
  digests: Array<{...}>,
  summaries?: Array<{ scope: string; content: object }>
) {
```

Pass it through to the template:

```typescript
  react: DigestEmail({ date: dateStr, digests, summaries, dashboardUrl }),
```

**Step 2: Update `DigestEmail` props and template in `emails/digest.tsx`**

Add to `DigestEmailProps`:

```typescript
  summaries?: Array<{ scope: string; content: object }>
```

Add after the sentiment counts line (`<Text style...>`) and before the first `<Hr />`:

```typescript
          {/* Global top-10 */}
          {(() => {
            const global = summaries?.find((s) => s.scope === "global")
            if (!global) return null
            const g = global.content as GlobalSummaryContent
            return (
              <>
                <Heading style={{ fontSize: "13px", color: "#374151", marginBottom: "4px" }}>TOP REFERENCES</Heading>
                {g.tickers.map((t) => (
                  <Text key={t.ticker} style={{ margin: "2px 0", fontSize: "12px" }}>
                    <strong>{t.ticker}</strong> — {t.consensus}
                    {t.contrarian ? ` ⚠ ${t.contrarian}` : ""}
                  </Text>
                ))}
              </>
            )
          })()}

          {/* Per-category summaries */}
          {CATEGORIES.map((cat) => {
            const row = summaries?.find((s) => s.scope === cat)
            if (!row) return null
            const c = row.content as CategorySummaryContent
            return (
              <Section key={cat}>
                <Heading style={{ fontSize: "13px", textTransform: "capitalize", color: "#374151" }}>
                  {cat}
                </Heading>
                <Text style={{ fontSize: "13px", color: "#374151", margin: "0 0 8px" }}>{c.text}</Text>
              </Section>
            )
          })}
```

Add the imports at top of `emails/digest.tsx`:
```typescript
import type { CategorySummaryContent, GlobalSummaryContent } from "@/lib/summarizer"
```

**Step 3: Update the pipeline's email call to pass summaries**

In `lib/pipeline.ts`, in both `sendDailyDigestEmail` call sites, fetch summaries and pass them:

```typescript
const summaries = await prisma.dailySummary.findMany({
  where: { date: targetDate },
})
await sendDailyDigestEmail(targetDate, emailPayload, summaries)
```

**Step 4: Build and verify**

```bash
npm run build 2>&1 | tail -20
```

Expected: clean build

**Step 5: Commit**

```bash
git add lib/email.ts emails/digest.tsx lib/pipeline.ts
git commit -m "feat: add global and category summaries to daily email"
```

---

## Task 7: Deploy and smoke test

**Step 1: Deploy to production**

```bash
vercel --prod 2>&1 | tail -10
```

**Step 2: Manually trigger summarizer for today**

After deployment, run the digest endpoint with today's date to trigger summary generation (will fire after email check hits the already-sent guard and returns no-op — summaries generate independently):

Actually, since the email is already sent for today, summaries won't auto-trigger. Run a one-off script:

```bash
node -e "
const { Client } = require('pg')
const client = new Client({ connectionString: 'postgresql://neondb_owner:REDACTED@ep-orange-shape-aiunslph.c-4.us-east-1.aws.neon.tech/neondb?connect_timeout=10&sslmode=require' })
// Check if summaries exist for today
client.connect()
  .then(() => client.query('SELECT scope FROM \"DailySummary\" WHERE date = CURRENT_DATE'))
  .then(r => { console.log('summaries:', r.rows.map(x => x.scope)); client.end() })
"
```

If none exist, trigger via a small script that calls `generateDailySummaries` with the correct date. See Task 8.

**Step 3: Check dashboard**

Open `https://notis.wallyhansen.com/dashboard` — verify `DailySummaryPanel` renders or shows nothing (expected if no summaries yet for today).

**Step 4: Commit any fixes, then push all**

```bash
git push
```

---

## Task 8: One-off backfill for today (optional)

If summaries don't exist for today's date yet, add a temporary `/api/digest/summarize` endpoint:

**File:** `app/api/digest/summarize/route.ts`

```typescript
import { NextResponse } from "next/server"
import { generateDailySummaries } from "@/lib/summarizer"
import { startOfDay, parseISO } from "date-fns"

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const body = await request.json().catch(() => ({}))
  const date = body.date ? startOfDay(parseISO(body.date)) : startOfDay(new Date())
  await generateDailySummaries(date)
  return NextResponse.json({ ok: true })
}
```

Deploy, then call:

```bash
curl -s -X POST https://notis.wallyhansen.com/api/digest/summarize \
  -H "Authorization: Bearer 5IkWd3skPLz3gjgE//y1N4qOl2Fe7d/H6Ougx+ki/iY=" \
  -H "Content-Type: application/json" \
  -d '{"date": "2026-03-01"}'
```

After confirming summaries appear on dashboard, this endpoint can stay (useful for manual regeneration).

---

## Checklist

- [ ] Task 1: Schema + migration
- [ ] Task 2: `lib/summarizer.ts`
- [ ] Task 3: Wire into pipeline
- [ ] Task 4: `DailySummaryPanel` component
- [ ] Task 5: Wire panel into dashboard
- [ ] Task 6: Email template updates
- [ ] Task 7: Deploy + smoke test
- [ ] Task 8: Backfill today (if needed)
