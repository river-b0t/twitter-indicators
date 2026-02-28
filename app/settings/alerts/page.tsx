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
