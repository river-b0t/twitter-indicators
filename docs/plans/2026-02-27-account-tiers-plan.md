# Account Tiers Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a 1/2/3 tier system to Twitter accounts so high-signal accounts sort to the top and can be filtered composably with categories.

**Architecture:** Add `tier Int @default(2)` to the schema, expose it through existing PATCH and new bulk `set-tier` action, add inline tier selectors in Settings, and add tier sort + filter to the dashboard.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind, Prisma 7, PostgreSQL (Neon). No test suite — manual verification steps given.

---

## Task 1: Schema — Add tier field

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<name>/migration.sql`

**Step 1: Edit schema.prisma**

In `prisma/schema.prisma`, add `tier` to `TwitterAccount` after the `active` line:

```prisma
model TwitterAccount {
  id          String   @id @default(cuid())
  handle      String   @unique
  displayName String
  categories  String[]
  avatarUrl   String?
  active      Boolean  @default(true)
  tier        Int      @default(2)
  createdAt   DateTime @default(now())
  tweets      Tweet[]
  digests     DailyDigest[]
}
```

**Step 2: Create migration SQL manually**

`migrate dev` fails locally on this project (Neon proxy issue). Create the migration file manually:

```bash
mkdir -p prisma/migrations/20260227000000_add_tier
cat > prisma/migrations/20260227000000_add_tier/migration.sql << 'EOF'
ALTER TABLE "TwitterAccount" ADD COLUMN "tier" INTEGER NOT NULL DEFAULT 2;
EOF
```

**Step 3: Pull prod env and apply migration**

```bash
vercel env pull /tmp/vercel-prod.env --environment production
```

From the output, find `DIRECT_URL`. Then:

```bash
DIRECT_URL=<value from above> npx prisma migrate deploy
```

Expected output: `1 migration applied successfully.`

**Step 4: Regenerate Prisma client**

```bash
npx prisma generate
```

**Step 5: Verify**

```bash
DATABASE_URL=<value> npx prisma studio
```

Open `TwitterAccount` table — confirm `tier` column exists with value `2` on all rows.

**Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add tier field to TwitterAccount schema"
```

---

## Task 2: API — Add bulk set-tier action

**Files:**
- Modify: `app/api/accounts/bulk/route.ts`

The PATCH route (`app/api/accounts/[id]/route.ts`) already passes `body` directly to Prisma `update`, so `PATCH /api/accounts/[id]` with `{ tier: 1 }` will work immediately — no changes needed there.

**Step 1: Update the request body type**

In `app/api/accounts/bulk/route.ts`, update the type and add the `set-tier` handler. Replace the entire file content:

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
    tier?: number
  }

  const { ids, action, categories, tier } = body

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
    if (tier === undefined || ![1, 2, 3].includes(tier)) {
      return NextResponse.json({ error: "tier must be 1, 2, or 3" }, { status: 400 })
    }
    await prisma.twitterAccount.updateMany({ where: { id: { in: ids } }, data: { tier } })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 })
}
```

**Step 2: Verify manually**

Run the dev server (`npm run dev`) and open Settings > Accounts. Select a few accounts and use the bulk tier button (built in Task 4). Or test via curl:

```bash
curl -s -X POST http://localhost:3000/api/accounts/bulk \
  -H "Content-Type: application/json" \
  -H "Cookie: site-auth=<your SITE_PASSWORD>" \
  -d '{"ids":["<some-id>"],"action":"set-tier","tier":1}' | jq .
```

Expected: `{ "ok": true }`

**Step 3: Commit**

```bash
git add app/api/accounts/bulk/route.ts
git commit -m "feat: add set-tier bulk action to accounts API"
```

---

## Task 3: Settings — Per-row tier pill selector

**Files:**
- Modify: `app/settings/accounts/page.tsx`

**Step 1: Add setTier helper function**

After the `deleteAccount` function, add:

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

**Step 2: Add tier pills to each account row**

Find the account row's right-side controls. Currently it contains `<Switch>` and the delete `<Button>`. Add tier pills before the `<Switch>`:

```tsx
{/* Tier pills */}
<div className="flex items-center gap-0.5">
  {[1, 2, 3].map((t) => (
    <button
      key={t}
      onClick={() => setTier(account.id, t)}
      className={`w-6 h-6 rounded text-xs font-mono font-medium transition-colors ${
        account.tier === t
          ? "bg-foreground text-background"
          : "text-muted-foreground hover:text-foreground hover:bg-accent"
      }`}
    >
      {t}
    </button>
  ))}
</div>
```

The full right-side div should now look like:

```tsx
<div className="flex items-center gap-3">
  {/* Tier pills */}
  <div className="flex items-center gap-0.5">
    {[1, 2, 3].map((t) => (
      <button
        key={t}
        onClick={() => setTier(account.id, t)}
        className={`w-6 h-6 rounded text-xs font-mono font-medium transition-colors ${
          account.tier === t
            ? "bg-foreground text-background"
            : "text-muted-foreground hover:text-foreground hover:bg-accent"
        }`}
      >
        {t}
      </button>
    ))}
  </div>
  <Switch
    checked={account.active}
    onCheckedChange={(v) => toggleActive(account.id, v)}
  />
  <Button variant="ghost" size="sm" onClick={() => deleteAccount(account.id)}>
    <Trash2 className="h-4 w-4 text-muted-foreground" />
  </Button>
</div>
```

**Step 3: Verify manually**

Open Settings > Accounts. Each account row should show small 1 / 2 / 3 buttons. Click one — it should highlight immediately (optimistic update) and persist on refresh.

**Step 4: Commit**

```bash
git add app/settings/accounts/page.tsx
git commit -m "feat: add per-row tier selector in Settings > Accounts"
```

---

## Task 4: Settings — Bulk set-tier

**Files:**
- Modify: `app/settings/accounts/page.tsx`

**Step 1: Add bulkSetTier state and function**

Add state at the top of the component (with the other state declarations):

```typescript
const [tierPopoverOpen, setTierPopoverOpen] = useState(false)
```

Add the bulk function after `bulkRemoveCategories`:

```typescript
async function bulkSetTier(tier: number) {
  const ids = Array.from(selected)
  await fetch("/api/accounts/bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids, action: "set-tier", tier }),
  })
  setAccounts((prev) =>
    prev.map((acc) => selected.has(acc.id) ? { ...acc, tier } : acc)
  )
  setTierPopoverOpen(false)
}
```

**Step 2: Add tier popover to the bulk action bar**

In the bulk action bar (the `fixed bottom-0` div), add this after the "Remove category" popover and before the Delete button:

```tsx
{/* Set tier popover */}
<Popover open={tierPopoverOpen} onOpenChange={setTierPopoverOpen}>
  <PopoverTrigger asChild>
    <Button variant="outline" size="sm" className="font-mono text-xs h-7">
      Set tier <ChevronDown className="h-3 w-3 ml-1" />
    </Button>
  </PopoverTrigger>
  <PopoverContent align="start" className="w-32 p-2" side="top">
    <div className="space-y-1">
      {[1, 2, 3].map((t) => (
        <button
          key={t}
          onClick={() => bulkSetTier(t)}
          className="w-full text-left px-2 py-1 rounded text-xs font-mono hover:bg-accent"
        >
          Tier {t}
        </button>
      ))}
    </div>
  </PopoverContent>
</Popover>
```

**Step 3: Verify manually**

Select multiple accounts, click "Set tier", pick tier 1. All selected accounts should immediately show "1" highlighted in their tier pills.

**Step 4: Commit**

```bash
git add app/settings/accounts/page.tsx
git commit -m "feat: add bulk set-tier action in Settings > Accounts"
```

---

## Task 5: Dashboard — Sort by tier

**Files:**
- Modify: `app/dashboard/page.tsx`

**Step 1: Update the Prisma query orderBy**

Find the `orderBy` in the `findMany` call. Change:

```typescript
orderBy: { handle: "asc" },
```

To:

```typescript
orderBy: [{ tier: "asc" }, { handle: "asc" }],
```

**Step 2: Verify manually**

In Settings, set a few accounts to tier 1. Open the dashboard — those accounts should appear first in the grid, followed by tier 2, then tier 3. Within each tier, accounts are alphabetical by handle.

**Step 3: Commit**

```bash
git add app/dashboard/page.tsx
git commit -m "feat: sort dashboard accounts by tier then handle"
```

---

## Task 6: Dashboard — Tier filter

**Files:**
- Modify: `app/dashboard/page.tsx`
- Create: `components/tier-filter.tsx`

**Step 1: Create TierFilter component**

```tsx
// components/tier-filter.tsx
"use client"
import { useRouter, useSearchParams } from "next/navigation"
import { useCallback } from "react"

export function TierFilter({ active }: { active: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const setTier = useCallback(
    (tier: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (tier === "all") {
        params.delete("tier")
      } else {
        params.set("tier", tier)
      }
      router.push(`/dashboard?${params.toString()}`)
    },
    [router, searchParams]
  )

  const options: { label: string; value: string }[] = [
    { label: "All", value: "all" },
    { label: "T1", value: "1" },
    { label: "T2", value: "2" },
    { label: "T3", value: "3" },
  ]

  return (
    <div className="flex items-center gap-1">
      {options.map(({ label, value }) => (
        <button
          key={value}
          onClick={() => setTier(value)}
          className={`px-2 py-0.5 rounded text-xs font-mono transition-colors ${
            active === value
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:text-foreground hover:bg-accent"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
```

**Step 2: Wire tier filter into dashboard page**

In `app/dashboard/page.tsx`:

1. Import `TierFilter`:
   ```typescript
   import { TierFilter } from "@/components/tier-filter"
   ```

2. Destructure `tier` from searchParams:
   ```typescript
   const { date: dateParam, category: categoryParam, tier: tierParam } = await searchParams
   const tier = tierParam ?? "all"
   ```

3. Add tier filter to the Prisma query's `where` clause:
   ```typescript
   const accounts = await prisma.twitterAccount.findMany({
     where: {
       active: true,
       ...(category !== "all" ? { categories: { hasSome: [category] } } : {}),
       ...(tier !== "all" ? { tier: parseInt(tier) } : {}),
     },
     // ...
   ```

4. Render `TierFilter` alongside `CategoryFilter`. Find the `<Suspense>` wrapping `CategoryFilter` and add `TierFilter` next to it:
   ```tsx
   <div className="flex items-center gap-4 flex-wrap">
     <Suspense>
       <CategoryFilter active={category} />
     </Suspense>
     <Suspense>
       <TierFilter active={tier} />
     </Suspense>
   </div>
   ```

   Note: Check `components/category-filter.tsx` to confirm its output — `TierFilter` should look consistent with it.

**Step 3: Verify manually**

On the dashboard, tier filter buttons should appear. Click "T1" — only tier 1 accounts show. Combine with a category filter — only tier 1 accounts in that category show. "All" resets the tier filter.

**Step 4: Commit**

```bash
git add components/tier-filter.tsx app/dashboard/page.tsx
git commit -m "feat: add tier filter to dashboard"
```

---

## Task 7: Deploy and verify on prod

**Step 1: Push to GitHub**

```bash
git push
```

Vercel will auto-deploy from `main`.

**Step 2: Verify prod**

Open `https://notis.wallyhansen.com/settings/accounts` — tier pills should appear on each row. Set a few accounts to tier 1. Open the dashboard — tier 1 accounts should float to top. Tier filter should work.

**Step 3: Done**
