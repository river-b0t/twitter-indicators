# Alerts + Sentiment Trends Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add keyword-based email alerts (4-hour cron, $0 cost) and a 30-day sentiment history strip on per-account drill-down pages.

**Architecture:** Alerts use two new Prisma models (AlertRule, AlertRun), a CRUD API for the Settings UI, and a cron endpoint that scans recent tweets for keyword matches and emails matches via Resend. Sentiment trends are a pure server component that queries the last 30 DailyDigest rows and renders colored squares.

**Tech Stack:** Next.js 16 App Router, Prisma 7 (PostgreSQL/Neon), Resend + React Email, shadcn/ui (Switch, Input, Button — already installed), Tailwind CSS, Vercel cron jobs.

**Important patterns:**
- API route auth (non-cron): check `site-auth` cookie — `request.cookies.get("site-auth")?.value === process.env.SITE_PASSWORD`
- Cron auth: bearer token — `request.headers.get("authorization") === "Bearer " + process.env.CRON_SECRET`
- Email sending: `lib/email.ts` pattern — `new Resend(process.env.RESEND_API_KEY!)`, send with `react:` prop
- React Email imports: `Html, Head, Body, Container, Section, Text, Heading, Hr, Link` from `@react-email/components`
- Prisma client: `import { prisma } from "@/lib/prisma"`
- No test suite — verify with `npm run build` and manual curl/browser checks after each task

**Migration note:** `migrate dev` fails locally against Neon (P1017). Generate the migration file locally, then deploy via `npx prisma migrate deploy` with the correct `DATABASE_URL` and `DIRECT_URL` (from `vercel env pull`). See project MEMORY.md for Neon DB details.

---

## Task 1: Prisma schema — add AlertRule and AlertRun models

**Files:**
- Modify: `prisma/schema.prisma`

**Step 1: Add models to schema**

Open `prisma/schema.prisma` and add these two models after the `DigestEmail` model (around line 79):

```prisma
model AlertRule {
  id        String   @id @default(cuid())
  keyword   String
  active    Boolean  @default(true)
  createdAt DateTime @default(now())
}

model AlertRun {
  id         String   @id @default(cuid())
  ranAt      DateTime @default(now())
  matchCount Int
  status     String   // "sent" | "no_matches" | "failed"
}
```

**Step 2: Generate migration**

```bash
cd /Users/openclaw/river-workspace/twitter-indicators
npx prisma migrate dev --name add_alert_rules_and_runs --create-only
```

This creates a migration file in `prisma/migrations/` without applying it (since local Neon connection fails). Expected output: migration file created at `prisma/migrations/<timestamp>_add_alert_rules_and_runs/migration.sql`.

**Step 3: Pull prod env and deploy migration**

```bash
vercel env pull /tmp/ti-prod.env --environment production
env $(cat /tmp/ti-prod.env | grep -v '^#' | xargs) npx prisma migrate deploy
```

Expected: "1 migration applied successfully" (or "No pending migrations" if already applied)

**Step 4: Generate Prisma client**

```bash
npx prisma generate
```

**Step 5: Verify build still passes**

```bash
npm run build 2>&1 | tail -20
```

Expected: successful build with no TypeScript errors.

**Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add AlertRule and AlertRun prisma models"
```

---

## Task 2: Alert rules API — GET + POST

**Files:**
- Create: `app/api/alert-rules/route.ts`

**Step 1: Create the file**

```typescript
import { NextResponse, NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"

function isAuthed(request: NextRequest) {
  const cookie = request.cookies.get("site-auth")
  return cookie?.value === process.env.SITE_PASSWORD
}

export async function GET(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const rules = await prisma.alertRule.findMany({ orderBy: { createdAt: "asc" } })
  return NextResponse.json(rules)
}

export async function POST(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { keyword } = await request.json() as { keyword: string }
  if (!keyword?.trim()) return NextResponse.json({ error: "keyword required" }, { status: 400 })
  const rule = await prisma.alertRule.create({ data: { keyword: keyword.trim() } })
  return NextResponse.json(rule)
}
```

**Step 2: Verify build**

```bash
npm run build 2>&1 | tail -10
```

Expected: clean build.

**Step 3: Commit**

```bash
git add app/api/alert-rules/route.ts
git commit -m "feat: add alert-rules GET and POST endpoints"
```

---

## Task 3: Alert rules API — PATCH + DELETE

**Files:**
- Create: `app/api/alert-rules/[id]/route.ts`

**Step 1: Create the file**

```typescript
import { NextResponse, NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"

function isAuthed(request: NextRequest) {
  const cookie = request.cookies.get("site-auth")
  return cookie?.value === process.env.SITE_PASSWORD
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  const { active } = await request.json() as { active: boolean }
  const rule = await prisma.alertRule.update({ where: { id }, data: { active } })
  return NextResponse.json(rule)
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  await prisma.alertRule.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
```

**Step 2: Verify build**

```bash
npm run build 2>&1 | tail -10
```

**Step 3: Commit**

```bash
git add app/api/alert-rules/[id]/route.ts
git commit -m "feat: add alert-rules PATCH and DELETE endpoints"
```

---

## Task 4: Alert email template

**Files:**
- Create: `emails/alert.tsx`

**Step 1: Create the file**

```typescript
import {
  Html, Head, Body, Container, Section, Text, Heading, Hr, Link
} from "@react-email/components"
import { formatDistanceToNow } from "date-fns"

interface MatchedTweet {
  handle: string
  text: string
  postedAt: Date
  url: string
}

interface AlertEmailProps {
  matchesByKeyword: Record<string, MatchedTweet[]>
  dashboardUrl: string
}

export function AlertEmail({ matchesByKeyword, dashboardUrl }: AlertEmailProps) {
  const totalCount = Object.values(matchesByKeyword).reduce((n, arr) => n + arr.length, 0)

  return (
    <Html>
      <Head />
      <Body style={{ fontFamily: "sans-serif", backgroundColor: "#f9fafb", padding: "20px" }}>
        <Container style={{ maxWidth: "600px", margin: "0 auto", backgroundColor: "#fff", padding: "32px", borderRadius: "8px" }}>
          <Heading style={{ fontSize: "20px", marginBottom: "4px" }}>Market Digest Alerts</Heading>
          <Text style={{ color: "#6b7280", marginTop: "0", fontSize: "13px" }}>
            {totalCount} keyword match{totalCount !== 1 ? "es" : ""} in the last 4 hours
          </Text>

          <Hr />

          {Object.entries(matchesByKeyword).map(([keyword, tweets]) => (
            <Section key={keyword} style={{ marginBottom: "24px" }}>
              <Heading style={{ fontSize: "14px", color: "#374151", marginBottom: "8px" }}>
                "{keyword}" — {tweets.length} match{tweets.length !== 1 ? "es" : ""}
              </Heading>
              {tweets.map((tweet, i) => (
                <Section key={i} style={{ marginBottom: "12px", paddingLeft: "12px", borderLeft: "2px solid #e5e7eb" }}>
                  <Text style={{ margin: "0", fontSize: "12px", color: "#6b7280" }}>
                    @{tweet.handle} · {formatDistanceToNow(new Date(tweet.postedAt), { addSuffix: true })}
                  </Text>
                  <Text style={{ margin: "4px 0 0", fontSize: "13px", color: "#111827" }}>{tweet.text}</Text>
                  <Link href={tweet.url} style={{ fontSize: "11px", color: "#9ca3af" }}>View on X →</Link>
                </Section>
              ))}
            </Section>
          ))}

          <Hr />
          <Link href={dashboardUrl} style={{ fontSize: "12px", color: "#6b7280" }}>Open dashboard →</Link>
        </Container>
      </Body>
    </Html>
  )
}
```

**Step 2: Verify build**

```bash
npm run build 2>&1 | tail -10
```

**Step 3: Commit**

```bash
git add emails/alert.tsx
git commit -m "feat: add alert email template"
```

---

## Task 5: Alert cron endpoint

**Files:**
- Create: `app/api/alerts/run/route.ts`

**Step 1: Create the file**

```typescript
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { Resend } from "resend"
import { AlertEmail } from "@/emails/alert"
import { subHours } from "date-fns"

const resend = new Resend(process.env.RESEND_API_KEY!)

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization")
  const isCron = authHeader === `Bearer ${process.env.CRON_SECRET}`
  if (!isCron) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    // Load active rules
    const rules = await prisma.alertRule.findMany({ where: { active: true } })
    if (!rules.length) {
      await prisma.alertRun.create({ data: { matchCount: 0, status: "no_matches" } })
      return NextResponse.json({ status: "no_matches", reason: "no active rules" })
    }

    // Determine time window: since last run, or 4 hours ago
    const lastRun = await prisma.alertRun.findFirst({ orderBy: { ranAt: "desc" } })
    const since = lastRun?.ranAt ?? subHours(new Date(), 4)

    // Load tweets in window, with account handle
    const tweets = await prisma.tweet.findMany({
      where: { postedAt: { gte: since } },
      include: { account: { select: { handle: true } } },
      orderBy: { postedAt: "desc" },
    })

    if (!tweets.length) {
      await prisma.alertRun.create({ data: { matchCount: 0, status: "no_matches" } })
      return NextResponse.json({ status: "no_matches", reason: "no new tweets" })
    }

    // Match tweets against each keyword (case-insensitive substring)
    const matchesByKeyword: Record<string, Array<{ handle: string; text: string; postedAt: Date; url: string }>> = {}
    for (const rule of rules) {
      const lower = rule.keyword.toLowerCase()
      const matches = tweets.filter((t) => t.text.toLowerCase().includes(lower))
      if (matches.length > 0) {
        matchesByKeyword[rule.keyword] = matches.map((t) => ({
          handle: t.account.handle,
          text: t.text,
          postedAt: t.postedAt,
          url: t.url,
        }))
      }
    }

    const totalMatches = Object.values(matchesByKeyword).reduce((n, arr) => n + arr.length, 0)

    if (totalMatches === 0) {
      await prisma.alertRun.create({ data: { matchCount: 0, status: "no_matches" } })
      return NextResponse.json({ status: "no_matches" })
    }

    // Send email
    const dashboardUrl = `${process.env.NEXTAUTH_URL}/dashboard`
    await resend.emails.send({
      from: process.env.RESEND_FROM!,
      to: process.env.DIGEST_TO!,
      subject: `[Alerts] ${totalMatches} keyword match${totalMatches !== 1 ? "es" : ""}`,
      react: AlertEmail({ matchesByKeyword, dashboardUrl }),
    })

    await prisma.alertRun.create({ data: { matchCount: totalMatches, status: "sent" } })
    return NextResponse.json({ status: "sent", matchCount: totalMatches })
  } catch (error) {
    await prisma.alertRun.create({ data: { matchCount: 0, status: "failed" } }).catch(() => {})
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
```

**Step 2: Verify build**

```bash
npm run build 2>&1 | tail -10
```

**Step 3: Commit**

```bash
git add app/api/alerts/run/route.ts
git commit -m "feat: add alerts cron endpoint"
```

---

## Task 6: Settings > Alerts page

**Files:**
- Create: `app/settings/alerts/page.tsx`

**Step 1: Check settings layout**

The settings layout lives at `app/settings/layout.tsx`. The alerts page will automatically use it. Confirm the file exists:

```bash
ls app/settings/layout.tsx
```

**Step 2: Create the page**

```typescript
"use client"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Trash2 } from "lucide-react"

interface AlertRule {
  id: string
  keyword: string
  active: boolean
  createdAt: string
}

export default function AlertsPage() {
  const [rules, setRules] = useState<AlertRule[]>([])
  const [keyword, setKeyword] = useState("")

  useEffect(() => {
    fetch("/api/alert-rules").then((r) => r.json()).then(setRules)
  }, [])

  async function addRule() {
    const trimmed = keyword.trim()
    if (!trimmed) return
    const res = await fetch("/api/alert-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyword: trimmed }),
    })
    const rule = await res.json()
    setRules((prev) => [...prev, rule])
    setKeyword("")
  }

  async function toggleActive(id: string, active: boolean) {
    await fetch(`/api/alert-rules/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active }),
    })
    setRules((prev) => prev.map((r) => r.id === id ? { ...r, active } : r))
  }

  async function deleteRule(id: string) {
    await fetch(`/api/alert-rules/${id}`, { method: "DELETE" })
    setRules((prev) => prev.filter((r) => r.id !== id))
  }

  return (
    <div className="space-y-6">
      <h1 className="font-mono text-sm tracking-widest uppercase text-foreground">Alerts</h1>
      <p className="text-xs text-muted-foreground font-mono">
        Runs every 4 hours. Emails you when any keyword appears in a tracked account's tweets.
      </p>

      {/* Add keyword */}
      <div className="flex gap-2">
        <Input
          placeholder="e.g. Bitcoin, rate cut, tariff"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addRule()}
          className="max-w-sm"
        />
        <Button onClick={addRule} disabled={!keyword.trim()}>Add</Button>
      </div>

      {/* Rules list */}
      {rules.length === 0 ? (
        <p className="text-sm text-muted-foreground font-mono">No alert rules yet. Add a keyword above.</p>
      ) : (
        <div className="space-y-2">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className="flex items-center justify-between p-3 border rounded-lg"
            >
              <span className="font-mono text-sm">{rule.keyword}</span>
              <div className="flex items-center gap-3">
                <Switch
                  checked={rule.active}
                  onCheckedChange={(v) => toggleActive(rule.id, v)}
                />
                <Button variant="ghost" size="sm" onClick={() => deleteRule(rule.id)}>
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

**Step 3: Verify build**

```bash
npm run build 2>&1 | tail -10
```

**Step 4: Commit**

```bash
git add app/settings/alerts/page.tsx
git commit -m "feat: add settings/alerts page with keyword CRUD"
```

---

## Task 7: Nav link + vercel.json cron

**Files:**
- Modify: `components/nav.tsx`
- Modify: `vercel.json`

**Step 1: Add Alerts link to nav**

In `components/nav.tsx`, add an "Alerts" link after the "Accounts" link (around line 24):

```diff
        <Link
          href="/settings/accounts"
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Accounts
        </Link>
+       <Link
+         href="/settings/alerts"
+         className="text-xs text-muted-foreground hover:text-foreground transition-colors"
+       >
+         Alerts
+       </Link>
```

**Step 2: Add second cron to vercel.json**

Replace the entire contents of `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/digest/run",
      "schedule": "0 16 * * *"
    },
    {
      "path": "/api/alerts/run",
      "schedule": "0 */4 * * *"
    }
  ]
}
```

**Step 3: Verify build**

```bash
npm run build 2>&1 | tail -10
```

**Step 4: Commit**

```bash
git add components/nav.tsx vercel.json
git commit -m "feat: add alerts nav link and 4-hour cron schedule"
```

---

## Task 8: SentimentHistory component

**Files:**
- Create: `components/sentiment-history.tsx`

**Step 1: Create the component**

```typescript
import { format } from "date-fns"

interface HistoryEntry {
  date: Date
  sentiment: string | null
}

interface Props {
  history: HistoryEntry[]
}

const SQUARE_COLOR: Record<string, string> = {
  bullish: "bg-green-500",
  bearish: "bg-red-500",
  mixed: "bg-yellow-400",
  neutral: "bg-slate-400",
}

export function SentimentHistory({ history }: Props) {
  const hasData = history.filter((h) => h.sentiment).length >= 2
  if (!hasData) return null

  return (
    <div className="flex items-end gap-[2px]">
      {history.map((entry) => {
        const label = entry.sentiment ?? "no data"
        const color = entry.sentiment ? (SQUARE_COLOR[entry.sentiment] ?? "bg-slate-400") : "bg-slate-800"
        const dateLabel = format(entry.date, "MMM d")
        return (
          <div
            key={entry.date.toISOString()}
            title={`${dateLabel}: ${label}`}
            className={`w-[4px] h-[16px] rounded-sm ${color}`}
          />
        )
      })}
    </div>
  )
}
```

**Step 2: Verify build**

```bash
npm run build 2>&1 | tail -10
```

**Step 3: Commit**

```bash
git add components/sentiment-history.tsx
git commit -m "feat: add SentimentHistory component (30 colored squares)"
```

---

## Task 9: Wire SentimentHistory into drill-down page

**Files:**
- Modify: `app/dashboard/[handle]/page.tsx`

**Step 1: Add history query and render**

The drill-down page is a server component at `app/dashboard/[handle]/page.tsx`. Make these changes:

1. Add imports at the top:
```typescript
import { subDays } from "date-fns"
import { SentimentHistory } from "@/components/sentiment-history"
```

2. After `const account = await prisma.twitterAccount.findUnique(...)` query (around line 36), add the history query:
```typescript
  // 30-day sentiment history
  const thirtyDaysAgo = subDays(startOfDay(new Date()), 29)
  const rawHistory = await prisma.dailyDigest.findMany({
    where: { accountId: account.id, date: { gte: thirtyDaysAgo } },
    select: { date: true, sentiment: true },
    orderBy: { date: "asc" },
  })

  // Build 30-day window with null fill for missing days
  const sentimentMap = new Map(rawHistory.map((h) => [format(h.date, "yyyy-MM-dd"), h.sentiment]))
  const history = Array.from({ length: 30 }, (_, i) => {
    const d = subDays(startOfDay(new Date()), 29 - i)
    return { date: d, sentiment: sentimentMap.get(format(d, "yyyy-MM-dd")) ?? null }
  })
```

3. In the JSX, insert `<SentimentHistory>` between the digest summary card and the tweet list (after the closing `)}` of `{digest?.summary && (...)}`):
```tsx
      {/* Sentiment history */}
      <SentimentHistory history={history} />
```

**Step 2: Verify build**

```bash
npm run build 2>&1 | tail -10
```

**Step 3: Commit**

```bash
git add app/dashboard/[handle]/page.tsx
git commit -m "feat: wire SentimentHistory into account drill-down page"
```

---

## Task 10: Deploy and verify

**Step 1: Push to GitHub and deploy**

```bash
git push
vercel --prod
```

**Step 2: Verify alerts CRUD**

Navigate to `https://notis.wallyhansen.com/settings/alerts`. Add a keyword (e.g. "Bitcoin"). Confirm it appears in the list. Toggle it off then on. Delete it. Should work without errors.

**Step 3: Verify alert cron manually**

```bash
# Pull CRON_SECRET from prod env
vercel env pull /tmp/ti-prod.env --environment production
CRON_SECRET=$(grep CRON_SECRET /tmp/ti-prod.env | cut -d= -f2 | tr -d '"')

curl -X POST https://notis.wallyhansen.com/api/alerts/run \
  -H "Authorization: Bearer $CRON_SECRET" \
  -v
```

Expected response: `{ "status": "no_matches" }` or `{ "status": "sent", "matchCount": N }`.

**Step 4: Verify sentiment history**

Navigate to any account drill-down page that has ≥2 days of digest history. Confirm the row of colored squares appears between the summary card and the tweet list. Hover a square to confirm the tooltip shows date + sentiment.

**Step 5: Verify cron schedule in Vercel**

In Vercel dashboard > Settings > Cron Jobs, confirm both crons are listed:
- `0 16 * * *` → `/api/digest/run`
- `0 */4 * * *` → `/api/alerts/run`
