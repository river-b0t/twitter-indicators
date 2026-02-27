import { prisma } from "@/lib/prisma"
import { AccountCard } from "@/components/account-card"
import { CategoryFilter } from "@/components/category-filter"
import { RefreshButton } from "@/components/refresh-button"
import { SummaryBox } from "@/components/summary-box"
import { DatePicker } from "@/components/date-picker"
import { format, startOfDay, parseISO } from "date-fns"
import { Suspense } from "react"
import type { TickerData } from "@/lib/finnhub"
import { aggregateDigests } from "@/lib/summary"

interface Props {
  searchParams: Promise<{ date?: string; category?: string }>
}

export default async function DashboardPage({ searchParams }: Props) {
  const { date: dateParam, category: categoryParam } = await searchParams
  const dateStr = dateParam ?? format(new Date(), "yyyy-MM-dd")
  const date = startOfDay(parseISO(dateStr))   // parseISO avoids UTC-vs-local issue
  const category = categoryParam ?? "all"

  const accounts = await prisma.twitterAccount.findMany({
    where: {
      active: true,
      ...(category !== "all" ? { categories: { hasSome: [category] } } : {}),
    },
    include: {
      digests: { where: { date }, take: 1 },
      tweets: { where: { postedAt: { gte: date } }, select: { id: true } },
    },
    orderBy: { handle: "asc" },
  })

  // Build category summary from fetched digests (no extra query needed)
  const digestInputs = accounts.map((a) => ({
    summary: a.digests[0]?.summary ?? null,
    sentiment: (a.digests[0]?.sentiment as string | null) ?? null,
    tickers: a.digests[0]?.tickers ?? [],
    tickerData: (a.digests[0]?.tickerData as TickerData | null) ?? null,
    account: { handle: a.handle },
  }))
  const categorySummary = aggregateDigests(digestInputs)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Suspense
          fallback={
            <p className="font-mono text-xs text-muted-foreground tracking-wide">
              {format(date, "EEE, MMM d yyyy").toUpperCase()}
            </p>
          }
        >
          <DatePicker dateStr={dateStr} />
        </Suspense>
        <RefreshButton />
      </div>

      <SummaryBox summary={categorySummary} />

      <Suspense>
        <CategoryFilter active={category} />
      </Suspense>

      {accounts.length === 0 ? (
        <p className="text-muted-foreground text-sm">No accounts found. Add some in Settings.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.map((account) => {
            const digest = account.digests[0]
            return (
              <AccountCard
                key={account.id}
                handle={account.handle}
                displayName={account.displayName}
                categories={account.categories}
                summary={digest?.summary ?? null}
                sentiment={digest?.sentiment ?? null}
                tickers={digest?.tickers ?? []}
                tickerData={digest?.tickerData as TickerData | null}
                tweetCount={account.tweets.length}
                date={dateStr}
                status={digest?.status ?? "pending"}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
