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
