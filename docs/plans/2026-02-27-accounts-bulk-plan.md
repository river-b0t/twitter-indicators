# Accounts Bulk Management Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an account tracker count to the accounts page header, multi-select checkboxes on each row, and a sticky bulk action bar for adding/removing categories and deleting selected accounts.

**Architecture:** Two changes — a new `POST /api/accounts/bulk` route handling delete/add-categories/remove-categories, and a full replacement of the accounts page client component adding selection state, select-all, the bulk action bar with Popover category pickers, and the tracker count. No schema changes needed.

**Tech Stack:** Next.js 16 App Router, Prisma 7, shadcn/ui (Popover already installed), TypeScript

**No test suite — skip TDD, implement directly.**

---

## Task 1: Create bulk API route

**Files:**
- Create: `app/api/accounts/bulk/route.ts`

**Step 1: Create the file**

```ts
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
    action: "delete" | "add-categories" | "remove-categories"
    categories?: string[]
  }

  const { ids, action, categories } = body

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

  return NextResponse.json({ error: "Unknown action" }, { status: 400 })
}
```

**Step 2: Verify build**

```bash
cd /Users/openclaw/river-workspace/twitter-indicators && npm run build
```

Expected: clean build.

**Step 3: Commit**

```bash
git add app/api/accounts/bulk/route.ts
git commit -m "feat: add bulk accounts API route (delete, add/remove categories)"
```

---

## Task 2: Update accounts page

**Files:**
- Modify: `app/settings/accounts/page.tsx`

**Step 1: Replace the full file**

```tsx
"use client"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Trash2, ChevronDown } from "lucide-react"

const CATEGORIES = ["traders", "crypto", "onchain", "vc", "tradfi", "thematic", "builders"] as const
const DISPLAY: Partial<Record<string, string>> = { vc: "Crypto VC", tradfi: "TradFi" }

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<any[]>([])
  const [handle, setHandle] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [primaryCategory, setPrimaryCategory] = useState("crypto")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [addCatOpen, setAddCatOpen] = useState(false)
  const [removeCatOpen, setRemoveCatOpen] = useState(false)
  const [bulkAddCats, setBulkAddCats] = useState<string[]>([])
  const [bulkRemoveCats, setBulkRemoveCats] = useState<string[]>([])

  useEffect(() => {
    fetch("/api/accounts").then((r) => r.json()).then(setAccounts)
  }, [])

  async function addAccount() {
    if (!handle || !displayName) return
    const res = await fetch("/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handle, displayName, categories: [primaryCategory] }),
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

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    if (selected.size === accounts.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(accounts.map((a) => a.id)))
    }
  }

  function clearSelection() {
    setSelected(new Set())
    setConfirmDelete(false)
    setBulkAddCats([])
    setBulkRemoveCats([])
  }

  async function bulkAddCategories() {
    if (!bulkAddCats.length) return
    const ids = Array.from(selected)
    await fetch("/api/accounts/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, action: "add-categories", categories: bulkAddCats }),
    })
    setAccounts((prev) =>
      prev.map((acc) =>
        selected.has(acc.id)
          ? { ...acc, categories: Array.from(new Set([...acc.categories, ...bulkAddCats])) }
          : acc
      )
    )
    setBulkAddCats([])
    setAddCatOpen(false)
  }

  async function bulkRemoveCategories() {
    if (!bulkRemoveCats.length) return
    const ids = Array.from(selected)
    await fetch("/api/accounts/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, action: "remove-categories", categories: bulkRemoveCats }),
    })
    setAccounts((prev) =>
      prev.map((acc) =>
        selected.has(acc.id)
          ? { ...acc, categories: acc.categories.filter((c: string) => !bulkRemoveCats.includes(c)) }
          : acc
      )
    )
    setBulkRemoveCats([])
    setRemoveCatOpen(false)
  }

  async function bulkDelete() {
    const ids = Array.from(selected)
    await fetch("/api/accounts/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, action: "delete" }),
    })
    setAccounts((prev) => prev.filter((acc) => !selected.has(acc.id)))
    clearSelection()
  }

  const allSelected = accounts.length > 0 && selected.size === accounts.length

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="font-mono text-sm tracking-widest uppercase text-foreground">Accounts</h1>
        <span className="font-mono text-xs text-muted-foreground">
          Tracking: {accounts.length} accounts
        </span>
      </div>

      {/* Add account form */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
        <div className="space-y-2">
          <Label>Handle</Label>
          <Input
            placeholder="unusual_whales"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Display Name</Label>
          <Input
            placeholder="Unusual Whales"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Primary Category</Label>
          <Select value={primaryCategory} onValueChange={setPrimaryCategory}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c} className="capitalize">
                  {DISPLAY[c] ?? c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={addAccount}>Add Account</Button>
      </div>

      {/* Select-all header row */}
      {accounts.length > 0 && (
        <div className="flex items-center gap-3 px-3 py-2 border-b border-border">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleSelectAll}
            className="h-3.5 w-3.5 accent-foreground cursor-pointer"
          />
          <span className="font-mono text-xs text-muted-foreground">
            {allSelected ? "Deselect all" : `Select all ${accounts.length}`}
          </span>
        </div>
      )}

      {/* Account list */}
      <div className="space-y-2">
        {accounts.map((account) => (
          <div
            key={account.id}
            className={`flex items-center justify-between p-3 border rounded-lg transition-colors ${
              selected.has(account.id) ? "border-foreground/30 bg-accent/30" : ""
            }`}
          >
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={selected.has(account.id)}
                onChange={() => toggleSelected(account.id)}
                className="h-3.5 w-3.5 accent-foreground cursor-pointer shrink-0"
              />
              <span className="font-mono text-sm">@{account.handle}</span>
              <span className="text-sm text-muted-foreground">{account.displayName}</span>
              {account.categories.map((c: string) => (
                <Badge key={c} variant="outline" className="capitalize text-xs">
                  {DISPLAY[c] ?? c}
                </Badge>
              ))}
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

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border px-6 py-3 flex items-center gap-3 z-50">
          <span className="font-mono text-xs text-muted-foreground shrink-0">
            {selected.size} selected
          </span>

          {/* Add category popover */}
          <Popover open={addCatOpen} onOpenChange={setAddCatOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="font-mono text-xs h-7">
                Add category <ChevronDown className="h-3 w-3 ml-1" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-44 p-2" side="top">
              <div className="space-y-1">
                {CATEGORIES.map((c) => (
                  <label
                    key={c}
                    className="flex items-center gap-2 px-2 py-1 rounded text-xs font-mono capitalize cursor-pointer hover:bg-accent"
                  >
                    <input
                      type="checkbox"
                      checked={bulkAddCats.includes(c)}
                      onChange={() =>
                        setBulkAddCats((prev) =>
                          prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
                        )
                      }
                      className="accent-foreground"
                    />
                    {DISPLAY[c] ?? c}
                  </label>
                ))}
                <Button
                  size="sm"
                  className="w-full mt-1 font-mono text-xs h-7"
                  disabled={!bulkAddCats.length}
                  onClick={bulkAddCategories}
                >
                  Apply
                </Button>
              </div>
            </PopoverContent>
          </Popover>

          {/* Remove category popover */}
          <Popover open={removeCatOpen} onOpenChange={setRemoveCatOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="font-mono text-xs h-7">
                Remove category <ChevronDown className="h-3 w-3 ml-1" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-44 p-2" side="top">
              <div className="space-y-1">
                {CATEGORIES.map((c) => (
                  <label
                    key={c}
                    className="flex items-center gap-2 px-2 py-1 rounded text-xs font-mono capitalize cursor-pointer hover:bg-accent"
                  >
                    <input
                      type="checkbox"
                      checked={bulkRemoveCats.includes(c)}
                      onChange={() =>
                        setBulkRemoveCats((prev) =>
                          prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
                        )
                      }
                      className="accent-foreground"
                    />
                    {DISPLAY[c] ?? c}
                  </label>
                ))}
                <Button
                  size="sm"
                  className="w-full mt-1 font-mono text-xs h-7"
                  disabled={!bulkRemoveCats.length}
                  onClick={bulkRemoveCategories}
                >
                  Apply
                </Button>
              </div>
            </PopoverContent>
          </Popover>

          {/* Delete */}
          {!confirmDelete ? (
            <Button
              variant="ghost"
              size="sm"
              className="font-mono text-xs text-red-400 hover:text-red-300 h-7"
              onClick={() => setConfirmDelete(true)}
            >
              Delete
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-red-400 shrink-0">
                Delete {selected.size}?
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="font-mono text-xs text-red-400 hover:text-red-300 h-7"
                onClick={bulkDelete}
              >
                Confirm
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="font-mono text-xs h-7"
                onClick={() => setConfirmDelete(false)}
              >
                Cancel
              </Button>
            </div>
          )}

          <Button
            variant="ghost"
            size="sm"
            className="font-mono text-xs text-muted-foreground ml-auto h-7"
            onClick={clearSelection}
          >
            ✕ Clear
          </Button>
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
git add app/settings/accounts/page.tsx
git commit -m "feat: account tracker count, multi-select, bulk category + delete actions"
```

---

## Task 3: Push and deploy

**Step 1: Push**

```bash
cd /Users/openclaw/river-workspace/twitter-indicators && git push
```

**Step 2: Deploy**

```bash
vercel --prod 2>&1 | tail -5
```

**Step 3: Smoke test**

Visit https://notis.wallyhansen.com/settings/accounts and confirm:
- "Tracking: N accounts" shows correct count in header ✓
- Checkbox on each row ✓
- Select-all checkbox works ✓
- Selecting rows highlights them and shows bulk action bar at bottom ✓
- Add category popover opens, lets you pick categories, Apply updates local state ✓
- Remove category popover works same way ✓
- Delete shows confirmation inline, Confirm removes accounts ✓
- ✕ clears selection and hides bar ✓
