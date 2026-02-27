import { prisma } from "@/lib/prisma"
import { notFound } from "next/navigation"
import { format, startOfDay, endOfDay, parseISO } from "date-fns"
import { Card, CardContent } from "@/components/ui/card"
import { TickerBadge } from "@/components/ticker-badge"
import type { TickerData } from "@/lib/finnhub"
import Link from "next/link"
import { ArrowLeft, ExternalLink, Heart, Repeat2 } from "lucide-react"
import type { Tweet } from "@prisma/client"

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

interface Props {
  params: Promise<{ handle: string }>
  searchParams: Promise<{ date?: string }>
}

export default async function DrilldownPage({ params, searchParams }: Props) {
  const { handle } = await params
  const { date: dateParam } = await searchParams
  const dateStr = dateParam ?? format(new Date(), "yyyy-MM-dd")
  const date = startOfDay(parseISO(dateStr))

  const account = await prisma.twitterAccount.findUnique({
    where: { handle },
    include: {
      tweets: {
        where: { postedAt: { gte: date, lte: endOfDay(date) } },
        orderBy: { postedAt: "asc" },
      },
      digests: { where: { date }, take: 1 },
    },
  })

  if (!account) notFound()

  const digest = account.digests[0]

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Back + header */}
      <div className="flex items-center gap-4">
        <Link
          href={`/dashboard?date=${dateStr}`}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="font-mono text-lg text-foreground">@{account.handle}</h1>
          <p className="font-mono text-xs text-muted-foreground tracking-wide">
            {format(date, "EEE, MMM d yyyy").toUpperCase()}
          </p>
        </div>
      </div>

      {/* Digest summary card */}
      {digest?.summary && (
        <Card>
          <CardContent className="pt-4 space-y-3">
            <p className="text-sm leading-relaxed text-foreground/80">{digest.summary}</p>
            <div className="flex flex-wrap items-center gap-2">
              {digest.sentiment && (
                <div className="flex items-center gap-1.5">
                  <div
                    className={`w-1.5 h-1.5 rounded-full ${sentimentDot[digest.sentiment] ?? "bg-slate-500"}`}
                  />
                  <span
                    className={`font-mono text-xs ${sentimentLabel[digest.sentiment] ?? "text-slate-400"}`}
                  >
                    {digest.sentiment}
                  </span>
                </div>
              )}
              {digest.tickers.map((t: string) => (
                <TickerBadge
                  key={t}
                  ticker={t}
                  entry={(digest.tickerData as TickerData | null)?.[t]}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tweet list */}
      <div className="space-y-3">
        {account.tweets.length === 0 ? (
          <p className="text-muted-foreground text-sm font-mono">No tweets found for this date.</p>
        ) : (
          account.tweets.map((tweet: Tweet) => {
            const isKey = digest?.keyTweetIds.includes(tweet.tweetId)
            return (
              <Card
                key={tweet.id}
                className={isKey ? "border-l-2 border-l-green-500" : ""}
              >
                <CardContent className="pt-4 space-y-2">
                  <p className="text-sm leading-relaxed">{tweet.text}</p>
                  <div className="flex items-center gap-4 font-mono text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Heart className="h-3 w-3" /> {tweet.likesCount}
                    </span>
                    <span className="flex items-center gap-1">
                      <Repeat2 className="h-3 w-3" /> {tweet.retweetsCount}
                    </span>
                    <span>{format(tweet.postedAt, "h:mm a")}</span>
                    <a
                      href={tweet.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 hover:text-foreground ml-auto transition-colors"
                    >
                      View on X <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </CardContent>
              </Card>
            )
          })
        )}
      </div>
    </div>
  )
}
