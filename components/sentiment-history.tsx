import { format } from "date-fns"

interface HistoryEntry {
  date: Date
  sentiment: string | null
}

interface Props {
  history: HistoryEntry[]
}

const SQUARE_COLOR: Record<string, string> = {
  bullish: "bg-green-500",
  bearish: "bg-red-500",
  mixed: "bg-yellow-400",
  neutral: "bg-slate-400",
}

export function SentimentHistory({ history }: Props) {
  const hasData = history.filter((h) => h.sentiment).length >= 2
  if (!hasData) return null

  return (
    <div className="flex items-end gap-[2px]">
      {history.map((entry) => {
        const label = entry.sentiment ?? "no data"
        const color = entry.sentiment ? (SQUARE_COLOR[entry.sentiment] ?? "bg-slate-400") : "bg-slate-800"
        const dateLabel = format(entry.date, "MMM d")
        return (
          <div
            key={entry.date.toISOString()}
            title={`${dateLabel}: ${label}`}
            className={`w-[4px] h-[16px] rounded-sm ${color}`}
          />
        )
      })}
    </div>
  )
}
