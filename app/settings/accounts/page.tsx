"use client"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Trash2 } from "lucide-react"

const CATEGORIES = ["traders", "crypto", "onchain", "vc", "tradfi", "thematic", "builders"]

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<any[]>([])
  const [handle, setHandle] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [primaryCategory, setPrimaryCategory] = useState("crypto")

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
          <Label>Primary Category</Label>
          <Select value={primaryCategory} onValueChange={setPrimaryCategory}>
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
              {account.categories.map((c: string) => (
                <Badge key={c} variant="outline" className="capitalize text-xs">{c}</Badge>
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
    </div>
  )
}
