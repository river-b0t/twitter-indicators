"use client"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"

const CATEGORIES = ["all", "traders", "crypto", "onchain", "vc", "tradfi", "thematic", "builders"] as const

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
