import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { TickerBadge } from "@/components/ticker-badge"
import Link from "next/link"
import type { TickerData } from "@/lib/finnhub"

const sentimentColors = {
  bullish: "bg-green-100 text-green-800",
  bearish: "bg-red-100 text-red-800",
  neutral: "bg-gray-100 text-gray-800",
  mixed: "bg-yellow-100 text-yellow-800",
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
  handle, displayName, categories, summary, sentiment, tickers, tickerData, tweetCount, date, status
}: AccountCardProps) {
  return (
    <Link href={`/dashboard/${handle}?date=${date}`}>
      <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-sm">@{handle}</p>
              <p className="text-xs text-muted-foreground">{displayName}</p>
            </div>
            {sentiment && (
              <Badge className={sentimentColors[sentiment as keyof typeof sentimentColors] ?? ""}>
                {sentiment}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {status === "failed" ? (
            <p className="text-sm text-muted-foreground italic">Digest unavailable</p>
          ) : status === "pending" ? (
            <p className="text-sm text-muted-foreground italic">Processing...</p>
          ) : (
            <p className="text-sm leading-relaxed">{summary}</p>
          )}
          {tickers.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {tickers.map((t) => (
                <TickerBadge
                  key={t}
                  ticker={t}
                  entry={tickerData?.[t]}
                />
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground">{tweetCount} tweets today</p>
        </CardContent>
      </Card>
    </Link>
  )
}
