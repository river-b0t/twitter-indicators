// components/date-picker.tsx
"use client"
import { useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"
import { format, parseISO } from "date-fns"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

export function DatePicker({ dateStr, basePath = "/digest" }: { dateStr: string; basePath?: string }) {
  const router = useRouter()
  const params = useSearchParams()
  const [open, setOpen] = useState(false)

  const date = parseISO(dateStr)

  function handleSelect(selected: Date | undefined) {
    if (!selected) return
    const p = new URLSearchParams(params.toString())
    p.set("date", format(selected, "yyyy-MM-dd"))
    router.push(`${basePath}?${p.toString()}`)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="font-mono text-xs text-muted-foreground tracking-wide hover:text-foreground transition-colors cursor-pointer">
          {format(date, "EEE, MMM d yyyy").toUpperCase()}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={handleSelect}
          toDate={new Date()}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  )
}
