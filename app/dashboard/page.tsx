import { prisma } from "@/lib/prisma"
import { AccountCard } from "@/components/account-card"
import { CategoryFilter } from "@/components/category-filter"
import { RefreshButton } from "@/components/refresh-button"
import { format, startOfDay } from "date-fns"
import { Suspense } from "react"

interface Props {
  searchParams: Promise<{ date?: string; category?: string }>
}

export default async function DashboardPage({ searchParams }: Props) {
  const { date: dateParam, category: categoryParam } = await searchParams
  const dateStr = dateParam ?? format(new Date(), "yyyy-MM-dd")
  const date = startOfDay(new Date(dateStr))
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Market Digest</h1>
          <p className="text-muted-foreground text-sm">{format(date, "EEEE, MMMM d, yyyy")}</p>
        </div>
        <RefreshButton />
      </div>

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
