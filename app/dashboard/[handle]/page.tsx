import { prisma } from "@/lib/prisma"
import { notFound } from "next/navigation"
import { format, startOfDay, endOfDay } from "date-fns"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import Link from "next/link"
import { ArrowLeft, ExternalLink, Heart, Repeat2 } from "lucide-react"
import type { Tweet } from "@prisma/client"

interface Props {
  params: Promise<{ handle: string }>
  searchParams: Promise<{ date?: string }>
}

export default async function DrilldownPage({ params, searchParams }: Props) {
  const { handle } = await params
  const { date: dateParam } = await searchParams
  const dateStr = dateParam ?? format(new Date(), "yyyy-MM-dd")
  const date = startOfDay(new Date(dateStr))

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
      <div className="flex items-center gap-4">
        <Link href={`/dashboard?date=${dateStr}`} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold">@{account.handle}</h1>
          <p className="text-sm text-muted-foreground">{format(date, "EEEE, MMMM d, yyyy")}</p>
        </div>
      </div>

      {digest?.summary && (
        <Card>
          <CardContent className="pt-4 space-y-2">
            <p className="text-sm">{digest.summary}</p>
            <div className="flex gap-2">
              {digest.sentiment && <Badge>{digest.sentiment}</Badge>}
              {digest.tickers.map((t: string) => (
                <Badge key={t} variant="outline">{t}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {account.tweets.length === 0 ? (
          <p className="text-muted-foreground text-sm">No tweets found for this date.</p>
        ) : (
          account.tweets.map((tweet: Tweet) => (
            <Card key={tweet.id} className={digest?.keyTweetIds.includes(tweet.tweetId) ? "border-primary" : ""}>
              <CardContent className="pt-4 space-y-2">
                <p className="text-sm">{tweet.text}</p>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Heart className="h-3 w-3" /> {tweet.likesCount}
                  </span>
                  <span className="flex items-center gap-1">
                    <Repeat2 className="h-3 w-3" /> {tweet.retweetsCount}
                  </span>
                  <span>{format(tweet.postedAt, "h:mm a")}</span>
                  <a href={tweet.url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 hover:text-foreground ml-auto">
                    View on X <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
