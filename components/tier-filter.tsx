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
