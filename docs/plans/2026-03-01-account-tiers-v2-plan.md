# Account Tiers v2 (Per-Category) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace account-level `tier Int` with per-category `tierMap Json` so a single account can be tier 1 as a trader but tier 2 for thematic.

**Architecture:** `tierMap` is a JSON object on TwitterAccount mapping category → tier (e.g. `{"traders":1,"thematic":2}`). Missing keys default to 2. Dashboard tier filtering happens in JS post-fetch (not in Prisma where clause) since JSON key filtering is awkward in Prisma. Sort also done in JS.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind, Prisma 7, PostgreSQL (Neon). No test suite.

---

## Task 1: Schema — Replace tier Int with tierMap Json

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260301000000_replace_tier_with_tiermap/migration.sql`

**Step 1: Edit schema.prisma**

Replace `tier Int @default(2)` with `tierMap Json @default("{}")` in `TwitterAccount`:

```prisma
model TwitterAccount {
  id          String   @id @default(cuid())
  handle      String   @unique
  displayName String
  categories  String[]
  avatarUrl   String?
  active      Boolean  @default(true)
  tierMap     Json     @default("{}")
  createdAt   DateTime @default(now())
  tweets      Tweet[]
  digests     DailyDigest[]
}
```

**Step 2: Create migration SQL**

```bash
mkdir -p /Users/openclaw/river-workspace/twitter-indicators/prisma/migrations/20260301000000_replace_tier_with_tiermap
```

Create `prisma/migrations/20260301000000_replace_tier_with_tiermap/migration.sql`:

```sql
ALTER TABLE "TwitterAccount" DROP COLUMN "tier";
ALTER TABLE "TwitterAccount" ADD COLUMN "tierMap" JSONB NOT NULL DEFAULT '{}';
```

**Step 3: Pull prod env and apply migration**

```bash
cd /Users/openclaw/river-workspace/twitter-indicators
vercel env pull /tmp/vercel-ti-prod.env --environment production
```

Parse the env file (use Python if shell source fails due to parse errors) and run:

```bash
npx prisma migrate deploy
```

Expected: `1 migration applied successfully.`

**Step 4: Regenerate Prisma client**

```bash
npx prisma generate
```

**Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: replace tier int with tierMap json on TwitterAccount"
```

---

## Task 2: Add helper lib — getTierForCategory

**Files:**
- Create: `lib/tiers.ts`

**Step 1: Create the helper**

```typescript
// lib/tiers.ts

/**
 * Returns the tier (1, 2, or 3) for a given account+category combination.
 * Defaults to 2 if not explicitly set.
 */
export function getTierForCategory(
  tierMap: Record<string, number> | null | unknown,
  category: string
): number {
  if (!tierMap || typeof tierMap !== "object" || Array.isArray(tierMap)) return 2
  const t = (tierMap as Record<string, number>)[category]
  return typeof t === "number" && [1, 2, 3].includes(t) ? t : 2
}

/**
 * Returns the best (lowest) tier an account has across all its categories.
 * Used for sorting/filtering when category="all".
 */
export function getBestTier(
  tierMap: Record<string, number> | null | unknown,
  categories: string[]
): number {
  if (!categories.length) return 2
  return Math.min(...categories.map((c) => getTierForCategory(tierMap, c)))
}
```

**Step 2: TypeScript check**

```bash
cd /Users/openclaw/river-workspace/twitter-indicators && npx tsc --noEmit 2>&1 | head -20
```

**Step 3: Commit**

```bash
git add lib/tiers.ts
git commit -m "feat: add getTierForCategory and getBestTier helpers"
```

---

## Task 3: API — Update bulk set-tier action

**Files:**
- Modify: `app/api/accounts/bulk/route.ts`

**Step 1: Update the set-tier handler**

The `set-tier` action now takes `{ ids, action: "set-tier", category, tier }` and merges into each account's existing tierMap.

Replace the entire file:

```typescript
import { NextResponse, NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"

function isAuthed(request: NextRequest) {
  const cookie = request.cookies.get("site-auth")
  return cookie?.value === process.env.SITE_PASSWORD
}

export async function POST(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json() as {
    ids: string[]
    action: "delete" | "add-categories" | "remove-categories" | "set-tier"
    categories?: string[]
    category?: string
    tier?: number
  }

  const { ids, action, categories, category, tier } = body

  if (!ids?.length) return NextResponse.json({ error: "No IDs provided" }, { status: 400 })

  if (action === "delete") {
    await prisma.twitterAccount.deleteMany({ where: { id: { in: ids } } })
    return NextResponse.json({ ok: true, count: ids.length })
  }

  if (action === "add-categories") {
    if (!categories?.length) return NextResponse.json({ error: "No categories" }, { status: 400 })
    const existing = await prisma.twitterAccount.findMany({
      where: { id: { in: ids } },
      select: { id: true, categories: true },
    })
    await prisma.$transaction(
      existing.map((acc) => {
        const merged = Array.from(new Set([...acc.categories, ...categories]))
        return prisma.twitterAccount.update({ where: { id: acc.id }, data: { categories: merged } })
      })
    )
    return NextResponse.json({ ok: true })
  }

  if (action === "remove-categories") {
    if (!categories?.length) return NextResponse.json({ error: "No categories" }, { status: 400 })
    const existing = await prisma.twitterAccount.findMany({
      where: { id: { in: ids } },
      select: { id: true, categories: true },
    })
    await prisma.$transaction(
      existing.map((acc) => {
        const filtered = acc.categories.filter((c) => !categories.includes(c))
        return prisma.twitterAccount.update({ where: { id: acc.id }, data: { categories: filtered } })
      })
    )
    return NextResponse.json({ ok: true })
  }

  if (action === "set-tier") {
    if (!category) return NextResponse.json({ error: "category required" }, { status: 400 })
    if (tier === undefined || ![1, 2, 3].includes(tier)) {
      return NextResponse.json({ error: "tier must be 1, 2, or 3" }, { status: 400 })
    }
    const existing = await prisma.twitterAccount.findMany({
      where: { id: { in: ids } },
      select: { id: true, tierMap: true },
    })
    await prisma.$transaction(
      existing.map((acc) => {
        const currentMap = (acc.tierMap as Record<string, number>) ?? {}
        return prisma.twitterAccount.update({
          where: { id: acc.id },
          data: { tierMap: { ...currentMap, [category]: tier } },
        })
      })
    )
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 })
}
```

**Step 2: TypeScript check**

```bash
cd /Users/openclaw/river-workspace/twitter-indicators && npx tsc --noEmit 2>&1 | head -20
```

**Step 3: Commit**

```bash
git add app/api/accounts/bulk/route.ts
git commit -m "feat: update bulk set-tier to support per-category tierMap"
```

---

## Task 4: Settings — Per-category tier selector

**Files:**
- Modify: `app/settings/accounts/page.tsx`

**Overview of changes:**
1. Remove `setTier(id, tier)` function — replace with `setCategoryTier(id, category, tier)`
2. Remove `tierPopoverOpen` state and `bulkSetTier` function — replace with per-category bulk
3. Remove per-row tier pills — replace with tier indicators on each category badge
4. Update bulk "Set tier" popover to first pick category, then tier

**Step 1: Read the current file first**

Read `app/settings/accounts/page.tsx` to see the exact current state before editing.

**Step 2: Replace `setTier` with `setCategoryTier`**

Remove:
```typescript
async function setTier(id: string, tier: number) {
  await fetch(`/api/accounts/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tier }),
  })
  setAccounts((a) => a.map((acc) => acc.id === id ? { ...acc, tier } : acc))
}
```

Add after `deleteAccount`:
```typescript
async function setCategoryTier(id: string, category: string, tier: number) {
  const account = accounts.find((a) => a.id === id)
  const currentMap = (account?.tierMap as Record<string, number>) ?? {}
  const newMap = { ...currentMap, [category]: tier }
  await fetch(`/api/accounts/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tierMap: newMap }),
  })
  setAccounts((a) => a.map((acc) => acc.id === id ? { ...acc, tierMap: newMap } : acc))
}
```

**Step 3: Update state declarations**

Remove:
```typescript
const [tierPopoverOpen, setTierPopoverOpen] = useState(false)
```

Add:
```typescript
const [bulkTierCategory, setBulkTierCategory] = useState<string | null>(null)
const [bulkTierPopoverOpen, setBulkTierPopoverOpen] = useState(false)
```

**Step 4: Replace `bulkSetTier` with per-category version**

Remove the old `bulkSetTier` function. Add:

```typescript
async function bulkSetTier(category: string, tier: number) {
  const ids = Array.from(selected)
  await fetch("/api/accounts/bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids, action: "set-tier", category, tier }),
  })
  setAccounts((prev) =>
    prev.map((acc) => {
      if (!selected.has(acc.id)) return acc
      const currentMap = (acc.tierMap as Record<string, number>) ?? {}
      return { ...acc, tierMap: { ...currentMap, [category]: tier } }
    })
  )
  setBulkTierPopoverOpen(false)
  setBulkTierCategory(null)
}
```

**Step 5: Replace per-row tier pills with per-category badge tier selectors**

Remove the entire `{/* Tier pills */}` block (the `<div className="flex items-center gap-0.5">...` with the 1/2/3 buttons) from each account row.

Replace each category badge rendering. Find the section that maps over `account.categories` and renders `<Badge>`:

```tsx
{account.categories.map((c: string) => (
  <Badge key={c} variant="outline" className="capitalize text-xs">
    {DISPLAY[c] ?? c}
  </Badge>
))}
```

Replace with a component that shows the category name + its current tier, with inline 1/2/3 mini-buttons on hover. Use a wrapper div with group:

```tsx
{account.categories.map((c: string) => {
  const t = ((account.tierMap as Record<string, number>) ?? {})[c] ?? 2
  return (
    <div key={c} className="group relative flex items-center gap-0.5">
      <span className="text-xs font-mono border border-border rounded px-1.5 py-0.5 capitalize">
        {DISPLAY[c] ?? c}
      </span>
      <div className="flex items-center gap-0">
        {[1, 2, 3].map((n) => (
          <button
            key={n}
            onClick={() => setCategoryTier(account.id, c, n)}
            className={`w-5 h-5 rounded text-[10px] font-mono font-medium transition-colors ${
              t === n
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  )
})}
```

**Step 6: Update bulk action bar "Set tier" popover**

Replace the old tier popover with a two-step version: first pick category, then tier. Replace the existing Set tier `<Popover>` block entirely:

```tsx
{/* Set tier popover — two-step: pick category then tier */}
<Popover open={bulkTierPopoverOpen} onOpenChange={(v) => { setBulkTierPopoverOpen(v); if (!v) setBulkTierCategory(null) }}>
  <PopoverTrigger asChild>
    <Button variant="outline" size="sm" className="font-mono text-xs h-7">
      Set tier <ChevronDown className="h-3 w-3 ml-1" />
    </Button>
  </PopoverTrigger>
  <PopoverContent align="start" className="w-40 p-2" side="top">
    {!bulkTierCategory ? (
      <div className="space-y-1">
        <p className="text-[10px] font-mono text-muted-foreground px-2 pb-1">Pick category</p>
        {CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setBulkTierCategory(c)}
            className="w-full text-left px-2 py-1 rounded text-xs font-mono capitalize hover:bg-accent"
          >
            {DISPLAY[c] ?? c}
          </button>
        ))}
      </div>
    ) : (
      <div className="space-y-1">
        <p className="text-[10px] font-mono text-muted-foreground px-2 pb-1 capitalize">
          {DISPLAY[bulkTierCategory] ?? bulkTierCategory} — pick tier
        </p>
        {[1, 2, 3].map((t) => (
          <button
            key={t}
            onClick={() => bulkSetTier(bulkTierCategory, t)}
            className="w-full text-left px-2 py-1 rounded text-xs font-mono hover:bg-accent"
          >
            Tier {t}
          </button>
        ))}
        <button
          onClick={() => setBulkTierCategory(null)}
          className="w-full text-left px-2 py-1 rounded text-[10px] font-mono text-muted-foreground hover:bg-accent"
        >
          ← Back
        </button>
      </div>
    )}
  </PopoverContent>
</Popover>
```

**Step 7: TypeScript check**

```bash
cd /Users/openclaw/river-workspace/twitter-indicators && npx tsc --noEmit 2>&1 | head -30
```

Fix any errors before committing.

**Step 8: Commit**

```bash
git add app/settings/accounts/page.tsx
git commit -m "feat: per-category tier selectors in Settings > Accounts"
```

---

## Task 5: Dashboard — JS tier filtering and sorting

**Files:**
- Modify: `app/dashboard/page.tsx`

**Step 1: Read the current file**

Read `app/dashboard/page.tsx` to see exact current state.

**Step 2: Import helpers**

Add to imports:
```typescript
import { getTierForCategory, getBestTier } from "@/lib/tiers"
```

**Step 3: Remove tier from Prisma where clause**

The Prisma query `where` should no longer include `...(tier !== "all" ? { tier: parseInt(tier) } : {})`. Remove that line.

Remove:
```typescript
...(tier !== "all" ? { tier: parseInt(tier) } : {}),
```

**Step 4: Remove orderBy tier from Prisma query**

Change:
```typescript
orderBy: [{ tier: "asc" }, { handle: "asc" }],
```
Back to:
```typescript
orderBy: { handle: "asc" },
```
(Sorting will be done in JS below.)

**Step 5: Add JS filtering and sorting after the Prisma query**

After the `accounts` fetch (before `digestInputs`), add:

```typescript
// Filter by tier in JS (tierMap is JSON, not efficiently filterable in Prisma)
const filteredAccounts = tier === "all"
  ? accounts
  : accounts.filter((a) => {
      const effectiveTier = category === "all"
        ? getBestTier(a.tierMap, a.categories)
        : getTierForCategory(a.tierMap, category)
      return effectiveTier === parseInt(tier)
    })

// Sort by effective tier ASC, then handle ASC
const sortedAccounts = [...filteredAccounts].sort((a, b) => {
  const aTier = category === "all"
    ? getBestTier(a.tierMap, a.categories)
    : getTierForCategory(a.tierMap, category)
  const bTier = category === "all"
    ? getBestTier(b.tierMap, b.categories)
    : getTierForCategory(b.tierMap, category)
  if (aTier !== bTier) return aTier - bTier
  return a.handle.localeCompare(b.handle)
})
```

**Step 6: Replace `accounts` with `sortedAccounts` in the render**

Find where `accounts.map` is used for rendering `AccountCard` components. Replace `accounts.map` with `sortedAccounts.map`.

Also update `digestInputs` to use `sortedAccounts` instead of `accounts`:
```typescript
const digestInputs = sortedAccounts.map((a) => ({ ... }))
```

And the empty state check:
```typescript
{sortedAccounts.length === 0 ? (
```

**Step 7: TypeScript check**

```bash
cd /Users/openclaw/river-workspace/twitter-indicators && npx tsc --noEmit 2>&1 | head -30
```

**Step 8: Commit**

```bash
git add app/dashboard/page.tsx
git commit -m "feat: dashboard tier filtering and sorting via tierMap"
```

---

## Task 6: Account detail page — show category tags

**Files:**
- Modify: `app/dashboard/[handle]/page.tsx`

**Step 1: Add category display mapping**

Near the top of the file (after the imports, before the component), add:

```typescript
const CATEGORY_DISPLAY: Partial<Record<string, string>> = { vc: "Crypto VC", tradfi: "TradFi" }
```

**Step 2: Add category badges to the header**

Find the header section:
```tsx
<div>
  <h1 className="font-mono text-lg text-foreground">@{account.handle}</h1>
  <p className="font-mono text-xs text-muted-foreground tracking-wide">
    {format(date, "EEE, MMM d yyyy").toUpperCase()}
  </p>
</div>
```

Replace with:
```tsx
<div>
  <div className="flex items-center gap-2 flex-wrap">
    <h1 className="font-mono text-lg text-foreground">@{account.handle}</h1>
    {account.categories.map((c) => (
      <span
        key={c}
        className="text-[10px] font-mono border border-border rounded px-1.5 py-0.5 capitalize text-muted-foreground"
      >
        {CATEGORY_DISPLAY[c] ?? c}
      </span>
    ))}
  </div>
  <p className="font-mono text-xs text-muted-foreground tracking-wide">
    {format(date, "EEE, MMM d yyyy").toUpperCase()}
  </p>
</div>
```

**Step 3: TypeScript check**

```bash
cd /Users/openclaw/river-workspace/twitter-indicators && npx tsc --noEmit 2>&1 | head -20
```

**Step 4: Commit**

```bash
git add app/dashboard/[handle]/page.tsx
git commit -m "feat: show category tags on account detail page"
```

---

## Task 7: Deploy and verify

**Step 1: Push and deploy**

```bash
cd /Users/openclaw/river-workspace/twitter-indicators
git push
vercel --prod
```

**Step 2: Verify on prod**

1. Open `https://notis.wallyhansen.com/settings/accounts` — each category badge shows inline 1/2/3 buttons with active tier highlighted
2. Click a tier button on a specific category — persists on refresh
3. Select multiple accounts, click "Set tier", pick a category, pick a tier — all selected accounts update
4. Open dashboard — tier filter T1 shows only accounts with tier 1 in the active category; tier 1 accounts sort to top
5. Click into an account card — detail page header shows category tags next to @handle

**Step 3: Done**
