import { prisma } from "@/lib/prisma"
import { AccountCard } from "@/components/account-card"
import { CategoryFilter } from "@/components/category-filter"
import { TierFilter } from "@/components/tier-filter"
import { RefreshButton } from "@/components/refresh-button"
import { DailySummaryPanel } from "@/components/DailySummaryPanel"
import { DatePicker } from "@/components/date-picker"
import { format, startOfDay, parseISO, addDays, subDays } from "date-fns"
import { Suspense } from "react"
import type { TickerData } from "@/lib/finnhub"
import { getTierForCategory, getBestTier } from "@/lib/tiers"

interface Props {
  searchParams: Promise<{ date?: string; category?: string; tier?: string }>
}

export default async function DashboardPage({ searchParams }: Props) {
  const { date: dateParam, category: categoryParam, tier: tierParam } = await searchParams
  const dateStr = dateParam ?? format(new Date(), "yyyy-MM-dd")
  const date = startOfDay(parseISO(dateStr))   // parseISO avoids UTC-vs-local issue
  const category = categoryParam ?? "all"
  const tier = tierParam ?? "all"

  const accounts = await prisma.twitterAccount.findMany({
    where: {
      active: true,
      ...(category !== "all" ? { categories: { hasSome: [category] } } : {}),
    },
    include: {
      digests: { where: { date }, take: 1 },
      tweets: { where: { postedAt: { gte: subDays(date, 1), lt: addDays(date, 1) } }, select: { id: true } },
    },
    orderBy: { handle: "asc" },
  })

  // Filter by tier in JS (tierMap is JSON, not efficiently filterable in Prisma)
  const filteredAccounts = tier === "all"
    ? accounts
    : accounts.filter((a) => {
        const effectiveTier = category === "all"
          ? getBestTier(a.tierMap, a.categories)
          : getTierForCategory(a.tierMap, category)
        return effectiveTier === parseInt(tier)
      })

  // Sort by effective tier ASC, then handle ASC
  const sortedAccounts = [...filteredAccounts].sort((a, b) => {
    const aTier = category === "all"
      ? getBestTier(a.tierMap, a.categories)
      : getTierForCategory(a.tierMap, category)
    const bTier = category === "all"
      ? getBestTier(b.tierMap, b.categories)
      : getTierForCategory(b.tierMap, category)
    if (aTier !== bTier) return aTier - bTier
    return a.handle.localeCompare(b.handle)
  })

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

      {category === "all" && (
        <Suspense>
          <DailySummaryPanel date={date} activeCategoryFilter={category} />
        </Suspense>
      )}

      <div className="flex items-center gap-4 flex-wrap">
        <Suspense>
          <CategoryFilter active={category} />
        </Suspense>
        <Suspense>
          <TierFilter active={tier} />
        </Suspense>
      </div>

      {(() => {
        const accountsWithContent = sortedAccounts.filter((a) => a.tweets.length > 0)
        const accountsWithoutContent = sortedAccounts.filter((a) => a.tweets.length === 0)
        return accountsWithContent.length === 0 && accountsWithoutContent.length === 0 ? (
          <p className="text-muted-foreground text-sm">No accounts found. Add some in Settings.</p>
        ) : (
          <>
            {accountsWithContent.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {accountsWithContent.map((account) => {
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
            {accountsWithoutContent.length > 0 && (
              <div className="mt-6">
                <p className="font-mono text-xs text-muted-foreground tracking-widest uppercase mb-2">
                  No tweets today ({accountsWithoutContent.length})
                </p>
                <p className="font-mono text-xs text-muted-foreground leading-relaxed">
                  {accountsWithoutContent.map((a) => `@${a.handle}`).join(", ")}
                </p>
              </div>
            )}
          </>
        )
      })()}
    </div>
  )
}
