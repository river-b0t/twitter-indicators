# Twitter Market Indicators Digest — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a standalone Next.js app that fetches daily tweets from monitored market accounts, runs batched Gemini LLM summarization, and serves results via a web dashboard + daily email digest.

**Architecture:** Vercel Cron triggers `/api/digest/run` daily at 8 AM PT. The pipeline fetches tweets via Apify, writes raw tweets to Supabase, runs one Gemini Flash 2.0 call per account to generate a DailyDigest record, then sends a Resend email. Dashboard reads from DailyDigest (cards view) and Tweet (drilldown view) tables.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind, shadcn/ui, Prisma, Supabase (PostgreSQL), Apify JS client, @google/generative-ai, Resend, React Email, NextAuth v5, Vercel

**Design doc:** `docs/plans/2026-02-23-twitter-indicators-design.md`

---

## Environment Variables

Create `.env.local` with:

```
DATABASE_URL=
DIRECT_URL=
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000
ADMIN_EMAIL=wally.hansn@gmail.com
ADMIN_PASSWORD=
APIFY_TOKEN=
GEMINI_API_KEY=
RESEND_API_KEY=
RESEND_FROM=digest@yourdomain.com
DIGEST_TO=wally.hansn@gmail.com
```

---

## Task 1: Scaffold Next.js App

**Files:**
- Create: `twitter-indicators/` (project root — scaffold into existing repo dir)

**Step 1: Scaffold the app**

Run from `/Users/openclaw/river-workspace/`:
```bash
cd twitter-indicators
npx create-next-app@latest . --typescript --tailwind --eslint --app --no-src-dir --import-alias "@/*"
```
Answer: Yes to all prompts.

**Step 2: Install dependencies**

```bash
npm install prisma @prisma/client next-auth@beta @auth/prisma-adapter \
  apify-client @google/generative-ai resend react-email \
  @react-email/components @react-email/tailwind \
  @shadcn/ui lucide-react date-fns
npm install -D @types/node
npx shadcn@latest init
```
shadcn init: Default style, Slate color, CSS variables: yes.

**Step 3: Install shadcn components**

```bash
npx shadcn@latest add button card badge input label select table dialog
npx shadcn@latest add separator skeleton tabs
```

**Step 4: Verify dev server starts**

```bash
npm run dev
```
Expected: `ready on http://localhost:3000`

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: scaffold Next.js app with dependencies"
```

---

## Task 2: Prisma Schema + Database

**Files:**
- Create: `prisma/schema.prisma`
- Create: `.env.local` (from env vars section above — do not commit)
- Create: `.gitignore` entry for `.env*`

**Step 1: Initialize Prisma**

```bash
npx prisma init
```

**Step 2: Write schema**

Replace `prisma/schema.prisma` with:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

enum AccountCategory {
  crypto
  tradfi
  onchain
  traders
  thematic
}

enum Sentiment {
  bullish
  bearish
  neutral
  mixed
}

enum DigestStatus {
  pending
  complete
  failed
}

enum EmailStatus {
  sent
  failed
}

model TwitterAccount {
  id          String          @id @default(cuid())
  handle      String          @unique
  displayName String
  category    AccountCategory
  avatarUrl   String?
  active      Boolean         @default(true)
  createdAt   DateTime        @default(now())
  tweets      Tweet[]
  digests     DailyDigest[]
}

model Tweet {
  id             String         @id @default(cuid())
  tweetId        String         @unique
  accountId      String
  account        TwitterAccount @relation(fields: [accountId], references: [id], onDelete: Cascade)
  text           String
  postedAt       DateTime
  likesCount     Int            @default(0)
  retweetsCount  Int            @default(0)
  url            String
  createdAt      DateTime       @default(now())
}

model DailyDigest {
  id          String         @id @default(cuid())
  accountId   String
  account     TwitterAccount @relation(fields: [accountId], references: [id], onDelete: Cascade)
  date        DateTime       @db.Date
  summary     String?
  sentiment   Sentiment?
  tickers     String[]
  keyTweetIds String[]
  status      DigestStatus   @default(pending)
  createdAt   DateTime       @default(now())
  updatedAt   DateTime       @updatedAt

  @@unique([accountId, date])
}

model DigestEmail {
  id      String      @id @default(cuid())
  date    DateTime    @db.Date
  sentAt  DateTime?
  status  EmailStatus
  error   String?
}

// NextAuth tables
model User {
  id            String    @id @default(cuid())
  name          String?
  email         String?   @unique
  emailVerified DateTime?
  image         String?
  password      String?
  accounts      Account[]
  sessions      Session[]
}

model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String? @db.Text
  access_token      String? @db.Text
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String? @db.Text
  session_state     String?
  user              User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime

  @@unique([identifier, token])
}
```

**Step 3: Run migration**

```bash
npx prisma migrate dev --name init
```
Expected: Migration created and applied, Prisma Client generated.

**Step 4: Verify client generates**

```bash
npx prisma generate
```

**Step 5: Commit**

```bash
git add prisma/ -A
git commit -m "feat: add Prisma schema with all models"
```

---

## Task 3: Auth Setup (NextAuth v5)

**Files:**
- Create: `auth.config.ts`
- Create: `auth.ts`
- Create: `middleware.ts`
- Create: `lib/prisma.ts`
- Create: `app/(auth)/login/page.tsx`
- Create: `app/(auth)/layout.tsx`
- Create: `app/api/auth/[...nextauth]/route.ts`

**Step 1: Create Prisma singleton**

`lib/prisma.ts`:
```typescript
import { PrismaClient } from "@prisma/client"

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({ log: ["error"] })

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma
```

**Step 2: Create auth config**

`auth.config.ts`:
```typescript
import type { NextAuthConfig } from "next-auth"
import Credentials from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"

export default {
  providers: [
    Credentials({
      async authorize(credentials) {
        const { email, password } = credentials as { email: string; password: string }
        const user = await prisma.user.findUnique({ where: { email } })
        if (!user?.password) return null
        const valid = await bcrypt.compare(password, user.password)
        return valid ? user : null
      },
    }),
  ],
  pages: { signIn: "/login" },
} satisfies NextAuthConfig
```

**Step 3: Install bcryptjs**

```bash
npm install bcryptjs && npm install -D @types/bcryptjs
```

**Step 4: Create auth.ts**

`auth.ts`:
```typescript
import NextAuth from "next-auth"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { prisma } from "@/lib/prisma"
import authConfig from "./auth.config"

export const { auth, handlers, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  ...authConfig,
})
```

**Step 5: Create middleware**

`middleware.ts`:
```typescript
import { auth } from "./auth"

export default auth((req) => {
  const isLoggedIn = !!req.auth
  const isAuthPage = req.nextUrl.pathname.startsWith("/login")
  if (!isLoggedIn && !isAuthPage) {
    return Response.redirect(new URL("/login", req.nextUrl))
  }
})

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
}
```

**Step 6: Create auth route handler**

`app/api/auth/[...nextauth]/route.ts`:
```typescript
import { handlers } from "@/auth"
export const { GET, POST } = handlers
```

**Step 7: Create login page**

`app/(auth)/layout.tsx`:
```typescript
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      {children}
    </div>
  )
}
```

`app/(auth)/login/page.tsx`:
```typescript
"use client"
import { signIn } from "next-auth/react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function LoginPage() {
  const [error, setError] = useState("")

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const result = await signIn("credentials", {
      email: fd.get("email"),
      password: fd.get("password"),
      redirectTo: "/dashboard",
    })
    if (result?.error) setError("Invalid credentials")
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Market Digest</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" required />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full">Sign in</Button>
        </form>
      </CardContent>
    </Card>
  )
}
```

**Step 8: Seed admin user**

`scripts/seed-user.ts`:
```typescript
import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const prisma = new PrismaClient()

async function main() {
  const email = process.env.ADMIN_EMAIL!
  const password = process.env.ADMIN_PASSWORD!
  const hash = await bcrypt.hash(password, 12)
  await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, password: hash, name: "Wally" },
  })
  console.log(`User seeded: ${email}`)
}

main().finally(() => prisma.$disconnect())
```

Run: `npx tsx scripts/seed-user.ts`

**Step 9: Add tsx for scripts**

```bash
npm install -D tsx
```

Add to `package.json` scripts:
```json
"seed:user": "tsx scripts/seed-user.ts"
```

**Step 10: Test login**

```bash
npm run dev
```
Navigate to `http://localhost:3000` — should redirect to `/login`. Log in with admin credentials → should land on `/dashboard` (404 is fine, page not built yet).

**Step 11: Commit**

```bash
git add -A
git commit -m "feat: add NextAuth v5 credentials auth with login page"
```

---

## Task 4: Apify Tweet Fetcher

**Files:**
- Create: `lib/apify.ts`
- Create: `scripts/test-apify.ts`

**Step 1: Write the Apify client**

`lib/apify.ts`:
```typescript
import { ApifyClient } from "apify-client"

const client = new ApifyClient({ token: process.env.APIFY_TOKEN! })

export interface RawTweet {
  tweetId: string
  text: string
  postedAt: Date
  likesCount: number
  retweetsCount: number
  url: string
}

export async function fetchTweetsForAccount(
  handle: string,
  sinceDate: Date
): Promise<RawTweet[]> {
  const since = sinceDate.toISOString().split("T")[0] // YYYY-MM-DD

  const run = await client.actor("apidojo/tweet-scraper").call({
    startUrls: [{ url: `https://twitter.com/${handle}` }],
    maxItems: 200,
    sinceDate: since,
    includeSearchTerms: false,
  })

  const { items } = await client
    .dataset(run.defaultDatasetId)
    .listItems()

  return items
    .filter((item: any) => item.author?.userName?.toLowerCase() === handle.toLowerCase())
    .map((item: any) => ({
      tweetId: item.id ?? item.tweetId,
      text: item.text ?? item.fullText ?? "",
      postedAt: new Date(item.createdAt),
      likesCount: item.likeCount ?? 0,
      retweetsCount: item.retweetCount ?? 0,
      url: item.url ?? `https://twitter.com/${handle}/status/${item.id}`,
    }))
}
```

**Step 2: Write smoke test**

`scripts/test-apify.ts`:
```typescript
import { fetchTweetsForAccount } from "../lib/apify"
import { config } from "dotenv"

config({ path: ".env.local" })

const handle = process.argv[2] ?? "unusual_whales"
const since = new Date()
since.setDate(since.getDate() - 1)

console.log(`Fetching tweets for @${handle} since ${since.toISOString()}...`)

fetchTweetsForAccount(handle, since)
  .then((tweets) => {
    console.log(`Fetched ${tweets.length} tweets`)
    console.log("Sample:", JSON.stringify(tweets[0], null, 2))
  })
  .catch(console.error)
```

**Step 3: Run smoke test**

```bash
npx tsx scripts/test-apify.ts unusual_whales
```
Expected: logs tweet count and sample tweet object. Adjust field mappings in `lib/apify.ts` if the Apify actor returns different field names.

**Step 4: Commit**

```bash
git add lib/apify.ts scripts/test-apify.ts
git commit -m "feat: add Apify tweet fetcher with smoke test"
```

---

## Task 5: Gemini LLM Summarizer

**Files:**
- Create: `lib/gemini.ts`
- Create: `scripts/test-gemini.ts`

**Step 1: Write Gemini client**

`lib/gemini.ts`:
```typescript
import { GoogleGenerativeAI } from "@google/generative-ai"

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" })

export interface DigestResult {
  summary: string
  sentiment: "bullish" | "bearish" | "neutral" | "mixed"
  tickers: string[]
  keyTweetIds: string[]
}

export async function summarizeAccountTweets(
  handle: string,
  tweets: Array<{ tweetId: string; text: string; postedAt: Date }>
): Promise<DigestResult> {
  if (tweets.length === 0) {
    return { summary: "No tweets today.", sentiment: "neutral", tickers: [], keyTweetIds: [] }
  }

  const tweetList = tweets
    .map((t) => `[${t.tweetId}] ${t.text}`)
    .join("\n\n")

  const prompt = `You are analyzing tweets from @${handle}, a market commentator/analyst.

Here are their tweets from today:
${tweetList}

Respond with a JSON object (no markdown, raw JSON only) with these fields:
- summary: 2-3 sentence summary of their key themes and views today
- sentiment: one of "bullish", "bearish", "neutral", or "mixed" based on overall market tone
- tickers: array of asset tickers or symbols mentioned (e.g. ["BTC", "ETH", "SPY"]), empty array if none
- keyTweetIds: array of 1-3 tweet IDs that best represent their most important points today

Example response:
{"summary":"...","sentiment":"bullish","tickers":["BTC","ETH"],"keyTweetIds":["123","456"]}`

  const result = await model.generateContent(prompt)
  const text = result.response.text().trim()

  try {
    return JSON.parse(text) as DigestResult
  } catch {
    // Gemini sometimes wraps in backticks despite instructions
    const cleaned = text.replace(/^```json?\n?/, "").replace(/\n?```$/, "")
    return JSON.parse(cleaned) as DigestResult
  }
}
```

**Step 2: Write smoke test**

`scripts/test-gemini.ts`:
```typescript
import { summarizeAccountTweets } from "../lib/gemini"
import { config } from "dotenv"

config({ path: ".env.local" })

const sampleTweets = [
  { tweetId: "1", text: "BTC looking strong here, expecting a move to 70k soon. Accumulating.", postedAt: new Date() },
  { tweetId: "2", text: "ETH/BTC ratio bottoming. Time to rotate.", postedAt: new Date() },
  { tweetId: "3", text: "Macro data today is key. Watch the 10yr.", postedAt: new Date() },
]

console.log("Testing Gemini summarization...")

summarizeAccountTweets("test_account", sampleTweets)
  .then((result) => console.log("Result:", JSON.stringify(result, null, 2)))
  .catch(console.error)
```

**Step 3: Run smoke test**

```bash
npx tsx scripts/test-gemini.ts
```
Expected: JSON with summary, sentiment: "bullish", tickers: ["BTC", "ETH"], keyTweetIds.

**Step 4: Commit**

```bash
git add lib/gemini.ts scripts/test-gemini.ts
git commit -m "feat: add Gemini Flash batch summarizer"
```

---

## Task 6: Digest Pipeline API Route

**Files:**
- Create: `app/api/digest/run/route.ts`
- Create: `lib/pipeline.ts`

**Step 1: Write pipeline orchestrator**

`lib/pipeline.ts`:
```typescript
import { prisma } from "./prisma"
import { fetchTweetsForAccount } from "./apify"
import { summarizeAccountTweets } from "./gemini"
import { format, startOfDay, endOfDay, subDays } from "date-fns"

export async function runDigestPipeline(date: Date = new Date()) {
  const targetDate = startOfDay(date)
  const since = subDays(targetDate, 1)

  const accounts = await prisma.twitterAccount.findMany({
    where: { active: true },
  })

  const results = await Promise.allSettled(
    accounts.map((account) => processAccount(account, targetDate, since))
  )

  return results.map((r, i) => ({
    handle: accounts[i].handle,
    status: r.status,
    error: r.status === "rejected" ? String(r.reason) : undefined,
  }))
}

async function processAccount(
  account: { id: string; handle: string },
  date: Date,
  since: Date
) {
  // Upsert digest as pending
  await prisma.dailyDigest.upsert({
    where: { accountId_date: { accountId: account.id, date } },
    create: { accountId: account.id, date, status: "pending" },
    update: { status: "pending" },
  })

  // Fetch tweets
  const rawTweets = await fetchTweetsForAccount(account.handle, since)

  // Upsert tweets
  await Promise.allSettled(
    rawTweets.map((t) =>
      prisma.tweet.upsert({
        where: { tweetId: t.tweetId },
        create: { ...t, accountId: account.id },
        update: {},
      })
    )
  )

  // Summarize
  const digest = await summarizeAccountTweets(account.handle, rawTweets)

  // Save digest
  await prisma.dailyDigest.update({
    where: { accountId_date: { accountId: account.id, date } },
    data: {
      summary: digest.summary,
      sentiment: digest.sentiment,
      tickers: digest.tickers,
      keyTweetIds: digest.keyTweetIds,
      status: "complete",
    },
  })
}
```

**Step 2: Write API route**

`app/api/digest/run/route.ts`:
```typescript
import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { runDigestPipeline } from "@/lib/pipeline"

export async function POST(request: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Also allow Vercel Cron (no session, but has secret header)
  const authHeader = request.headers.get("authorization")
  const isCron = authHeader === `Bearer ${process.env.CRON_SECRET}`
  if (!session && !isCron) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const results = await runDigestPipeline()
    return NextResponse.json({ results })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
```

**Step 3: Add CRON_SECRET to .env.local**

```
CRON_SECRET=some-random-secret-string
```

**Step 4: Write full pipeline smoke test**

`scripts/test-pipeline.ts`:
```typescript
import { runDigestPipeline } from "../lib/pipeline"
import { config } from "dotenv"

config({ path: ".env.local" })

console.log("Running digest pipeline for today...")

runDigestPipeline()
  .then((results) => {
    console.log("Pipeline results:")
    results.forEach((r) => console.log(`  @${r.handle}: ${r.status}${r.error ? ` — ${r.error}` : ""}`))
    process.exit(0)
  })
  .catch((e) => {
    console.error("Pipeline failed:", e)
    process.exit(1)
  })
```

Add to `package.json` scripts:
```json
"test:pipeline": "tsx scripts/test-pipeline.ts"
```

**Step 5: Commit**

```bash
git add lib/pipeline.ts app/api/digest/run/ scripts/test-pipeline.ts
git commit -m "feat: add digest pipeline orchestrator and API route"
```

---

## Task 7: Seed Accounts Script

**Files:**
- Create: `scripts/seed-accounts.ts`

**Step 1: Write seed script**

`scripts/seed-accounts.ts`:
```typescript
import { PrismaClient } from "@prisma/client"
import { config } from "dotenv"

config({ path: ".env.local" })

const prisma = new PrismaClient()

const accounts = [
  // traders
  { handle: "Tradermayne", displayName: "Mayne", category: "traders" as const },
  { handle: "cointradernik", displayName: "Nik", category: "traders" as const },
  { handle: "22loops", displayName: "Looposhi", category: "traders" as const },
  { handle: "CryptoParadyme", displayName: "Dyme", category: "traders" as const },
  { handle: "ImTrizzy", displayName: "Trizzy", category: "traders" as const },
  { handle: "buyerofponzi", displayName: "Ponzi Trader", category: "traders" as const },
  { handle: "owen1v9", displayName: "owen", category: "traders" as const },
  { handle: "blknoiz06", displayName: "Ansem", category: "traders" as const },
  { handle: "filthy555", displayName: "filthy", category: "traders" as const },
  { handle: "d_gilz", displayName: "David", category: "traders" as const },
  { handle: "Ritesh_Trades", displayName: "Ritesh", category: "traders" as const },
  { handle: "c0xswain", displayName: "ML", category: "traders" as const },
  { handle: "Rob100x", displayName: "Rob", category: "traders" as const },
  { handle: "RiffRaffOz", displayName: "RiffRaff", category: "traders" as const },
  { handle: "Crypto_Chase", displayName: "Crypto Chase", category: "traders" as const },
  // crypto
  { handle: "cobie", displayName: "Cobie", category: "crypto" as const },
  { handle: "0xsmac", displayName: "smac", category: "crypto" as const },
  { handle: "bitmine", displayName: "thorfinn", category: "crypto" as const },
  { handle: "btceejay", displayName: "hen", category: "crypto" as const },
  { handle: "badenglishtea", displayName: "badenglishtea", category: "crypto" as const },
  // tradfi
  { handle: "abcampbell", displayName: "Campbell", category: "tradfi" as const },
  { handle: "MacroCRG", displayName: "CRG", category: "tradfi" as const },
  { handle: "alpinestar17", displayName: "Alpinestar", category: "tradfi" as const },
  { handle: "BobLoukas", displayName: "Bob Loukas", category: "tradfi" as const },
  // thematic
  { handle: "worldsfacing", displayName: "facing worlds", category: "thematic" as const },
  { handle: "optimist", displayName: "optimist", category: "thematic" as const },
]

async function main() {
  for (const account of accounts) {
    await prisma.twitterAccount.upsert({
      where: { handle: account.handle },
      update: {},
      create: account,
    })
    console.log(`Seeded @${account.handle}`)
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
```

Add to `package.json` scripts:
```json
"seed:accounts": "tsx scripts/seed-accounts.ts"
```

**Step 2: Run seed**

```bash
npm run seed:accounts
```
Expected: logs each seeded account.

**Step 3: Commit**

```bash
git add scripts/seed-accounts.ts
git commit -m "feat: add account seed script with placeholder accounts"
```

---

## Task 8: Dashboard Layout + Navigation

**Files:**
- Create: `app/layout.tsx` (update)
- Create: `app/dashboard/layout.tsx`
- Create: `components/nav.tsx`
- Create: `app/page.tsx` (redirect)

**Step 1: Root redirect**

`app/page.tsx`:
```typescript
import { redirect } from "next/navigation"
export default function Home() {
  redirect("/dashboard")
}
```

**Step 2: Nav component**

`components/nav.tsx`:
```typescript
import Link from "next/link"
import { signOut } from "@/auth"
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
          await signOut({ redirectTo: "/login" })
        }}
      >
        <Button variant="ghost" size="sm" type="submit">Sign out</Button>
      </form>
    </nav>
  )
}
```

**Step 3: Dashboard layout**

`app/dashboard/layout.tsx`:
```typescript
import { Nav } from "@/components/nav"

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main className="max-w-7xl mx-auto px-6 py-8">{children}</main>
    </div>
  )
}
```

**Step 4: Commit**

```bash
git add app/ components/nav.tsx
git commit -m "feat: add dashboard layout and nav"
```

---

## Task 9: Dashboard Main View

**Files:**
- Create: `app/dashboard/page.tsx`
- Create: `components/account-card.tsx`
- Create: `components/category-filter.tsx`
- Create: `components/refresh-button.tsx`

**Step 1: Account card component**

`components/account-card.tsx`:
```typescript
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"

const sentimentColors = {
  bullish: "bg-green-100 text-green-800",
  bearish: "bg-red-100 text-red-800",
  neutral: "bg-gray-100 text-gray-800",
  mixed: "bg-yellow-100 text-yellow-800",
}

interface AccountCardProps {
  handle: string
  displayName: string
  category: string
  summary: string | null
  sentiment: string | null
  tickers: string[]
  tweetCount: number
  date: string
  status: string
}

export function AccountCard({
  handle, displayName, category, summary, sentiment, tickers, tweetCount, date, status
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
                <Badge key={t} variant="outline" className="text-xs">{t}</Badge>
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

**Step 2: Category filter**

`components/category-filter.tsx`:
```typescript
"use client"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"

const CATEGORIES = ["all", "crypto", "tradfi", "onchain", "traders", "thematic"] as const

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
    <div className="flex flex-wrap gap-2">
      {CATEGORIES.map((cat) => (
        <Button
          key={cat}
          variant={active === cat ? "default" : "outline"}
          size="sm"
          onClick={() => select(cat)}
          className="capitalize"
        >
          {cat}
        </Button>
      ))}
    </div>
  )
}
```

**Step 3: Refresh button**

`components/refresh-button.tsx`:
```typescript
"use client"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { RefreshCw } from "lucide-react"
import { useRouter } from "next/navigation"

export function RefreshButton() {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleRefresh() {
    setLoading(true)
    await fetch("/api/digest/run", { method: "POST" })
    setLoading(false)
    router.refresh()
  }

  return (
    <Button onClick={handleRefresh} disabled={loading} variant="outline" size="sm">
      <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
      {loading ? "Refreshing..." : "Refresh"}
    </Button>
  )
}
```

**Step 4: Dashboard page**

`app/dashboard/page.tsx`:
```typescript
import { prisma } from "@/lib/prisma"
import { AccountCard } from "@/components/account-card"
import { CategoryFilter } from "@/components/category-filter"
import { RefreshButton } from "@/components/refresh-button"
import { format, startOfDay } from "date-fns"
import { Suspense } from "react"

interface Props {
  searchParams: { date?: string; category?: string }
}

export default async function DashboardPage({ searchParams }: Props) {
  const dateStr = searchParams.date ?? format(new Date(), "yyyy-MM-dd")
  const date = startOfDay(new Date(dateStr))
  const category = searchParams.category ?? "all"

  const accounts = await prisma.twitterAccount.findMany({
    where: {
      active: true,
      ...(category !== "all" ? { category: category as any } : {}),
    },
    include: {
      digests: { where: { date }, take: 1 },
      tweets: { where: { postedAt: { gte: date } }, select: { id: true } },
    },
    orderBy: { handle: "asc" },
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Market Digest</h1>
          <p className="text-muted-foreground text-sm">{format(date, "EEEE, MMMM d, yyyy")}</p>
        </div>
        <RefreshButton />
      </div>

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
                category={account.category}
                summary={digest?.summary ?? null}
                sentiment={digest?.sentiment ?? null}
                tickers={digest?.tickers ?? []}
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

**Step 5: Test in browser**

```bash
npm run dev
```
Navigate to `http://localhost:3000/dashboard` — should show account cards (empty digests until pipeline runs).

**Step 6: Commit**

```bash
git add app/dashboard/ components/
git commit -m "feat: add dashboard main view with account cards and category filter"
```

---

## Task 10: Tweet Drilldown View

**Files:**
- Create: `app/dashboard/[handle]/page.tsx`

**Step 1: Write drilldown page**

`app/dashboard/[handle]/page.tsx`:
```typescript
import { prisma } from "@/lib/prisma"
import { notFound } from "next/navigation"
import { format, startOfDay, endOfDay } from "date-fns"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import Link from "next/link"
import { ArrowLeft, ExternalLink, Heart, Repeat2 } from "lucide-react"

interface Props {
  params: { handle: string }
  searchParams: { date?: string }
}

export default async function DrilldownPage({ params, searchParams }: Props) {
  const dateStr = searchParams.date ?? format(new Date(), "yyyy-MM-dd")
  const date = startOfDay(new Date(dateStr))

  const account = await prisma.twitterAccount.findUnique({
    where: { handle: params.handle },
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
      <div className="flex items-center gap-4">
        <Link href={`/dashboard?date=${dateStr}`} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold">@{account.handle}</h1>
          <p className="text-sm text-muted-foreground">{format(date, "EEEE, MMMM d, yyyy")}</p>
        </div>
      </div>

      {digest?.summary && (
        <Card>
          <CardContent className="pt-4 space-y-2">
            <p className="text-sm">{digest.summary}</p>
            <div className="flex gap-2">
              {digest.sentiment && <Badge>{digest.sentiment}</Badge>}
              {digest.tickers.map((t) => (
                <Badge key={t} variant="outline">{t}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {account.tweets.length === 0 ? (
          <p className="text-muted-foreground text-sm">No tweets found for this date.</p>
        ) : (
          account.tweets.map((tweet) => (
            <Card key={tweet.id} className={digest?.keyTweetIds.includes(tweet.tweetId) ? "border-primary" : ""}>
              <CardContent className="pt-4 space-y-2">
                <p className="text-sm">{tweet.text}</p>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Heart className="h-3 w-3" /> {tweet.likesCount}
                  </span>
                  <span className="flex items-center gap-1">
                    <Repeat2 className="h-3 w-3" /> {tweet.retweetsCount}
                  </span>
                  <span>{format(tweet.postedAt, "h:mm a")}</span>
                  <a href={tweet.url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 hover:text-foreground ml-auto">
                    View on X <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add app/dashboard/
git commit -m "feat: add tweet drilldown view"
```

---

## Task 11: Account Management Settings

**Files:**
- Create: `app/settings/accounts/page.tsx`
- Create: `app/settings/layout.tsx`
- Create: `app/api/accounts/route.ts`
- Create: `app/api/accounts/[id]/route.ts`

**Step 1: Accounts API routes**

`app/api/accounts/route.ts`:
```typescript
import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const accounts = await prisma.twitterAccount.findMany({ orderBy: { handle: "asc" } })
  return NextResponse.json(accounts)
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const body = await request.json()
  const account = await prisma.twitterAccount.create({ data: body })
  return NextResponse.json(account)
}
```

`app/api/accounts/[id]/route.ts`:
```typescript
import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const body = await request.json()
  const account = await prisma.twitterAccount.update({ where: { id: params.id }, data: body })
  return NextResponse.json(account)
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  await prisma.twitterAccount.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}
```

**Step 2: Settings layout**

`app/settings/layout.tsx`:
```typescript
import { Nav } from "@/components/nav"

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main className="max-w-4xl mx-auto px-6 py-8">{children}</main>
    </div>
  )
}
```

**Step 3: Accounts page**

`app/settings/accounts/page.tsx`:
```typescript
"use client"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Trash2 } from "lucide-react"

const CATEGORIES = ["crypto", "tradfi", "onchain", "traders", "thematic"]

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<any[]>([])
  const [handle, setHandle] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [category, setCategory] = useState("crypto")

  useEffect(() => {
    fetch("/api/accounts").then((r) => r.json()).then(setAccounts)
  }, [])

  async function addAccount() {
    if (!handle || !displayName) return
    const res = await fetch("/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handle, displayName, category }),
    })
    const newAccount = await res.json()
    setAccounts((a) => [...a, newAccount])
    setHandle("")
    setDisplayName("")
  }

  async function toggleActive(id: string, active: boolean) {
    await fetch(`/api/accounts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active }),
    })
    setAccounts((a) => a.map((acc) => acc.id === id ? { ...acc, active } : acc))
  }

  async function deleteAccount(id: string) {
    await fetch(`/api/accounts/${id}`, { method: "DELETE" })
    setAccounts((a) => a.filter((acc) => acc.id !== id))
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Accounts</h1>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
        <div className="space-y-2">
          <Label>Handle</Label>
          <Input placeholder="unusual_whales" value={handle} onChange={(e) => setHandle(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Display Name</Label>
          <Input placeholder="Unusual Whales" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Category</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={addAccount}>Add Account</Button>
      </div>

      <div className="space-y-2">
        {accounts.map((account) => (
          <div key={account.id} className="flex items-center justify-between p-3 border rounded-lg">
            <div className="flex items-center gap-3">
              <span className="font-medium text-sm">@{account.handle}</span>
              <span className="text-sm text-muted-foreground">{account.displayName}</span>
              <Badge variant="outline" className="capitalize text-xs">{account.category}</Badge>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                checked={account.active}
                onCheckedChange={(v) => toggleActive(account.id, v)}
              />
              <Button variant="ghost" size="sm" onClick={() => deleteAccount(account.id)}>
                <Trash2 className="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

**Step 4: Install Switch component**

```bash
npx shadcn@latest add switch
```

**Step 5: Commit**

```bash
git add app/settings/ app/api/accounts/
git commit -m "feat: add account management settings page"
```

---

## Task 12: Email Digest (React Email + Resend)

**Files:**
- Create: `emails/digest.tsx`
- Create: `lib/email.ts`
- Update: `lib/pipeline.ts`

**Step 1: Write email template**

`emails/digest.tsx`:
```typescript
import {
  Html, Head, Body, Container, Section, Text, Heading, Hr, Link
} from "@react-email/components"

interface AccountDigest {
  handle: string
  displayName: string
  category: string
  summary: string
  sentiment: string
  tickers: string[]
}

interface DigestEmailProps {
  date: string
  digests: AccountDigest[]
  dashboardUrl: string
}

const CATEGORIES = ["crypto", "tradfi", "onchain", "traders", "thematic"]

const sentimentEmoji: Record<string, string> = {
  bullish: "📈",
  bearish: "📉",
  neutral: "➡️",
  mixed: "↕️",
}

export function DigestEmail({ date, digests, dashboardUrl }: DigestEmailProps) {
  const sentimentCounts = digests.reduce((acc, d) => {
    acc[d.sentiment] = (acc[d.sentiment] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  const grouped = CATEGORIES.reduce((acc, cat) => {
    acc[cat] = digests.filter((d) => d.category === cat)
    return acc
  }, {} as Record<string, AccountDigest[]>)

  return (
    <Html>
      <Head />
      <Body style={{ fontFamily: "sans-serif", backgroundColor: "#f9fafb", padding: "20px" }}>
        <Container style={{ maxWidth: "600px", margin: "0 auto", backgroundColor: "#fff", padding: "32px", borderRadius: "8px" }}>
          <Heading style={{ fontSize: "20px", marginBottom: "4px" }}>Market Digest</Heading>
          <Text style={{ color: "#6b7280", marginTop: "0" }}>{date}</Text>

          <Text style={{ fontSize: "14px" }}>
            {Object.entries(sentimentCounts).map(([s, n]) => `${sentimentEmoji[s] ?? ""} ${n} ${s}`).join(" · ")}
          </Text>

          <Hr />

          {CATEGORIES.map((cat) => {
            const catDigests = grouped[cat]
            if (!catDigests?.length) return null
            return (
              <Section key={cat}>
                <Heading style={{ fontSize: "14px", textTransform: "capitalize", color: "#374151" }}>{cat}</Heading>
                {catDigests.map((d) => (
                  <Section key={d.handle} style={{ marginBottom: "16px" }}>
                    <Text style={{ margin: "0", fontWeight: "bold", fontSize: "13px" }}>
                      @{d.handle} {sentimentEmoji[d.sentiment] ?? ""}
                      {d.tickers.length > 0 && ` · ${d.tickers.join(", ")}`}
                    </Text>
                    <Text style={{ margin: "4px 0 0", fontSize: "13px", color: "#374151" }}>{d.summary}</Text>
                  </Section>
                ))}
              </Section>
            )
          })}

          <Hr />
          <Link href={dashboardUrl} style={{ fontSize: "12px", color: "#6b7280" }}>View full dashboard →</Link>
        </Container>
      </Body>
    </Html>
  )
}
```

**Step 2: Write email sender**

`lib/email.ts`:
```typescript
import { Resend } from "resend"
import { DigestEmail } from "@/emails/digest"
import { format } from "date-fns"

const resend = new Resend(process.env.RESEND_API_KEY!)

export async function sendDailyDigestEmail(
  date: Date,
  digests: Array<{
    handle: string
    displayName: string
    category: string
    summary: string
    sentiment: string
    tickers: string[]
  }>
) {
  const dateStr = format(date, "EEEE, MMMM d, yyyy")
  const dashboardUrl = `${process.env.NEXTAUTH_URL}/dashboard?date=${format(date, "yyyy-MM-dd")}`

  await resend.emails.send({
    from: process.env.RESEND_FROM!,
    to: process.env.DIGEST_TO!,
    subject: `Market Digest — ${dateStr}`,
    react: DigestEmail({ date: dateStr, digests, dashboardUrl }),
  })
}
```

**Step 3: Wire email into pipeline**

In `lib/pipeline.ts`, add after the `Promise.allSettled` results loop:

```typescript
import { sendDailyDigestEmail } from "./email"
import { prisma } from "./prisma"

// After processing all accounts, at the end of runDigestPipeline:
const completedDigests = await prisma.dailyDigest.findMany({
  where: { date: targetDate, status: "complete" },
  include: { account: true },
})

const emailPayload = completedDigests.map((d) => ({
  handle: d.account.handle,
  displayName: d.account.displayName,
  category: d.account.category,
  summary: d.summary!,
  sentiment: d.sentiment!,
  tickers: d.tickers,
}))

try {
  await sendDailyDigestEmail(targetDate, emailPayload)
  await prisma.digestEmail.create({
    data: { date: targetDate, sentAt: new Date(), status: "sent" },
  })
} catch (error) {
  await prisma.digestEmail.create({
    data: { date: targetDate, status: "failed", error: String(error) },
  })
}
```

**Step 4: Commit**

```bash
git add emails/ lib/email.ts lib/pipeline.ts
git commit -m "feat: add React Email digest template and Resend integration"
```

---

## Task 13: Vercel Cron + Deployment Config

**Files:**
- Create: `vercel.json`
- Update: `.env` (production env vars in Vercel dashboard)

**Step 1: Write vercel.json**

`vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/digest/run",
      "schedule": "0 16 * * *"
    }
  ]
}
```
Note: `0 16 * * *` = 8 AM PT (UTC-8) = 4 PM UTC. Adjust for daylight saving if needed.

**Step 2: Update API route to handle cron auth**

The `app/api/digest/run/route.ts` already handles `CRON_SECRET` header. Vercel sends `Authorization: Bearer <CRON_SECRET>` automatically when `CRON_SECRET` env var is set.

Fix the auth logic (current version has a bug — session check blocks cron):
```typescript
export async function POST(request: Request) {
  const session = await auth()
  const authHeader = request.headers.get("authorization")
  const isCron = authHeader === `Bearer ${process.env.CRON_SECRET}`

  if (!session && !isCron) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const results = await runDigestPipeline()
    return NextResponse.json({ results })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
```

**Step 3: Add to .gitignore**

Ensure `.env.local` and `.env*.local` are in `.gitignore` (Next.js adds these by default).

**Step 4: Commit**

```bash
git add vercel.json app/api/digest/run/
git commit -m "feat: add Vercel cron config for daily 8 AM PT digest"
```

**Step 5: Deploy**

```bash
vercel --prod
```
Set all env vars in Vercel dashboard under Settings > Environment Variables. Run `npm run seed:accounts` against production DB after deploy.

---

## Task 14: End-to-End Smoke Test

**Step 1: Run pipeline smoke test locally**

```bash
npm run seed:accounts  # if not done yet
npm run test:pipeline
```
Expected: each account shows `status: 'fulfilled'`, digest records in DB.

**Step 2: Verify dashboard**

```bash
npm run dev
```
Navigate to `http://localhost:3000/dashboard` — account cards should show summaries and sentiment badges.

**Step 3: Test email locally**

Add `RESEND_API_KEY` and `RESEND_FROM` to `.env.local`. In `scripts/test-pipeline.ts`, the email step runs automatically. Check inbox.

**Step 4: Test on-demand refresh**

Click Refresh button on dashboard — should trigger pipeline and reload cards.

**Step 5: Final commit + push**

```bash
git push origin main
```

---

## Open Items Before Starting

1. **Account list** — Wally to provide the full list of Twitter handles and categories for `scripts/seed-accounts.ts`
2. **Apify actor field mapping** — Run `scripts/test-apify.ts` with one real account and verify field names match `lib/apify.ts` mapping
3. **Resend domain** — Set up a sending domain in Resend dashboard and update `RESEND_FROM`
4. **Vercel cron secret** — Generate a random string for `CRON_SECRET` in both `.env.local` and Vercel dashboard

---

## Execution Order

Tasks 1-3 are sequential (scaffold → schema → auth). Tasks 4-5 are independent (Apify + Gemini clients). Task 6 depends on 4+5. Tasks 7-11 are mostly independent UI/feature work. Tasks 12-14 wrap everything up.
