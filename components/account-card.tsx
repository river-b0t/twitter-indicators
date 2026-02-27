import { TickerBadge } from "@/components/ticker-badge"
import Link from "next/link"
import type { TickerData } from "@/lib/finnhub"

const sentimentBorder: Record<string, string> = {
  bullish: "border-l-green-500",
  bearish: "border-l-red-500",
  neutral: "border-l-slate-500",
  mixed: "border-l-amber-500",
}

const sentimentDot: Record<string, string> = {
  bullish: "bg-green-500",
  bearish: "bg-red-500",
  neutral: "bg-slate-500",
  mixed: "bg-amber-500",
}

const sentimentLabel: Record<string, string> = {
  bullish: "text-green-400",
  bearish: "text-red-400",
  neutral: "text-slate-400",
  mixed: "text-amber-400",
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
    ? (sentimentBorder[sentiment] ?? "border-l-border")
    : "border-l-transparent"

  return (
    <Link href={`/dashboard/${handle}?date=${date}`}>
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
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${sentimentDot[sentiment] ?? "bg-border"}`}
              />
              <span className={`font-mono text-xs ${sentimentLabel[sentiment] ?? "text-muted-foreground"}`}>
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
