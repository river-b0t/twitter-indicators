"use client"
import { useRouter, useSearchParams } from "next/navigation"

const CATEGORIES = ["all", "traders", "crypto", "onchain", "vc", "tradfi", "thematic", "builders"] as const

const DISPLAY: Partial<Record<typeof CATEGORIES[number], string>> = {
  vc: "Crypto VC",
  tradfi: "TradFi",
}

export function CategoryFilter({ active }: { active: string }) {
  const router = useRouter()
  const params = useSearchParams()

  function select(cat: string) {
    const p = new URLSearchParams(params.toString())
    if (cat === "all") p.delete("category")
    else p.set("category", cat)
    router.push(`/digest?${p.toString()}`)
  }

  return (
    <div className="flex flex-wrap gap-0 border-b border-border">
      {CATEGORIES.map((cat) => (
        <button
          key={cat}
          onClick={() => select(cat)}
          className={`px-3 py-2 text-xs font-mono capitalize transition-colors border-b-2 -mb-px ${
            active === cat
              ? "text-foreground border-foreground"
              : "text-muted-foreground border-transparent hover:text-foreground"
          }`}
        >
          {DISPLAY[cat] ?? cat}
        </button>
      ))}
    </div>
  )
}
