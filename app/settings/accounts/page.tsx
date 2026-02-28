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
  const [tierPopoverOpen, setTierPopoverOpen] = useState(false)
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

  async function setTier(id: string, tier: number) {
    await fetch(`/api/accounts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tier }),
    })
    setAccounts((a) => a.map((acc) => acc.id === id ? { ...acc, tier } : acc))
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
