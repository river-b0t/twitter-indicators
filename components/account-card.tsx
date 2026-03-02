import { TickerBadge } from "@/components/ticker-badge"
import Link from "next/link"
import type { TickerData } from "@/lib/finnhub"

function getSentimentStyles(sentiment: string): {
  border: string
  dot: string
  label: string
} {
  switch (sentiment) {
    case "bullish":
      return { border: "border-l-green-500", dot: "bg-green-500", label: "text-green-400" }
    case "bearish":
      return { border: "border-l-red-500", dot: "bg-red-500", label: "text-red-400" }
    case "neutral":
      return { border: "border-l-slate-500", dot: "bg-slate-500", label: "text-slate-400" }
    case "mixed":
      return { border: "border-l-amber-500", dot: "bg-amber-500", label: "text-amber-400" }
    default:
      return { border: "border-l-slate-500", dot: "bg-slate-500", label: "text-slate-400" }
  }
}

interface AccountCardProps {
  handle: string
  displayName: string
  categories: string[]
  summary: string | null
  sentiment: string | null
  tickers: string[]
  tickerData?: TickerData | null
  tweetCount: number
  date: string
  status: string
}

export function AccountCard({
  handle,
  displayName,
  summary,
  sentiment,
  tickers,
  tickerData,
  tweetCount,
  date,
  status,
}: AccountCardProps) {
  const borderColor = sentiment
    ? getSentimentStyles(sentiment).border
    : "border-l-transparent"

  return (
    <Link href={`/digest/${handle}?date=${date}`}>
      <div
        className={`bg-card border border-border border-l-4 ${borderColor} rounded-lg p-4 cursor-pointer hover:bg-accent transition-colors h-full flex flex-col gap-3`}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-mono text-sm text-foreground">@{handle}</p>
            <p className="text-xs text-muted-foreground">{displayName}</p>
          </div>
          {sentiment && (
            <div className="flex items-center gap-1.5 shrink-0">
              <div
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${getSentimentStyles(sentiment).dot}`}
              />
              <span className={`font-mono text-xs ${getSentimentStyles(sentiment).label}`}>
                {sentiment}
              </span>
            </div>
          )}
        </div>

        {/* Summary */}
        <div className="flex-1">
          {status === "failed" ? (
            <p className="text-sm text-muted-foreground italic">Digest unavailable</p>
          ) : status === "pending" ? (
            <p className="text-sm text-muted-foreground italic">Processing...</p>
          ) : (
            <p className="text-sm leading-relaxed text-foreground/80">{summary}</p>
          )}
        </div>

        {/* Tickers */}
        {tickers.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {tickers.map((t) => (
              <TickerBadge key={t} ticker={t} entry={tickerData?.[t]} />
            ))}
          </div>
        )}

        {/* Footer */}
        <p className="font-mono text-xs text-muted-foreground">{tweetCount} tweets</p>
      </div>
    </Link>
  )
}
