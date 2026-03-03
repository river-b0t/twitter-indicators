import { prisma } from "./prisma"
import { fetchTweetsForAccount } from "./twitter"
import { summarizeAccountTweets } from "./gemini"
import { fetchTickerPrices } from "./finnhub"
import { startOfDay, subDays } from "date-fns"

const BATCH_SIZE = 5
// Only send digest email at or after 16:00 UTC (8 AM PT)
const EMAIL_SEND_HOUR_UTC = 16

export async function runDigestPipeline(date: Date = new Date()) {
  const targetDate = startOfDay(date)
  const since = subDays(targetDate, 1)

  // Find active accounts not yet processed today (no digest or failed)
  const totalActive = await prisma.twitterAccount.count({ where: { active: true } })

  const staleCutoff = new Date(Date.now() - 10 * 60 * 1000)
  const processedIds = await prisma.dailyDigest.findMany({
    where: {
      date: targetDate,
      OR: [
        { status: "complete" },
        { status: "pending", updatedAt: { gte: staleCutoff } },
      ],
    },
    select: { accountId: true },
  })
  const processedSet = new Set(processedIds.map((d) => d.accountId))

  const batch = await prisma.twitterAccount.findMany({
    where: { active: true, id: { notIn: [...processedSet] } },
    take: BATCH_SIZE,
    orderBy: { id: "asc" },
  })

  // No accounts left to process this run — still check if email needs sending
  if (batch.length === 0) {
    const completedCount = await prisma.dailyDigest.count({
      where: { date: targetDate, status: "complete" },
    })
    if (completedCount >= totalActive && new Date().getUTCHours() >= EMAIL_SEND_HOUR_UTC) {
      const alreadySent = await prisma.digestEmail.findFirst({
        where: { date: targetDate, status: "sent" },
      })
      if (!alreadySent) {
        const completedDigests = await prisma.dailyDigest.findMany({
          where: { date: targetDate, status: "complete" },
          include: { account: true },
        })
        if (completedDigests.length > 0) {
          const { sendDailyDigestEmail } = await import("./email")
          const { generateDailySummaries } = await import("./summarizer")
          // Generate summaries first so they're available in the email
          await generateDailySummaries(targetDate).catch((err) =>
            console.error("[pipeline] summarizer failed:", err)
          )
          const emailPayload = completedDigests.map((d) => ({
            handle: d.account.handle,
            displayName: d.account.displayName,
            categories: d.account.categories,
            tierMap: d.account.tierMap as Record<string, number> | undefined,
            summary: d.summary!,
            sentiment: d.sentiment!,
            tickers: d.tickers,
            tickerData: d.tickerData as Record<string, { price?: number; change?: number; resolved: boolean }> | undefined,
          }))
          const freshSummaries = (await prisma.dailySummary.findMany({
            where: { date: targetDate },
          })) as Array<{ scope: string; content: object }>
          try {
            await sendDailyDigestEmail(targetDate, emailPayload, freshSummaries)
            await prisma.digestEmail.create({
              data: { date: targetDate, sentAt: new Date(), status: "sent" },
            })
          } catch (error) {
            await prisma.digestEmail.create({
              data: { date: targetDate, status: "failed", error: String(error) },
            })
          }
        }
      }
    }
    return { batch: [], status: "no-op", message: "All accounts already processed today" }
  }

  const results = await Promise.allSettled(
    batch.map((account) => processAccount(account, targetDate, since))
  )

  // After this batch, check if all accounts are now complete → send email
  const completedCount = await prisma.dailyDigest.count({
    where: { date: targetDate, status: "complete" },
  })

  const isLastBatch = completedCount >= totalActive && new Date().getUTCHours() >= EMAIL_SEND_HOUR_UTC
  if (isLastBatch) {
    const completedDigests = await prisma.dailyDigest.findMany({
      where: { date: targetDate, status: "complete" },
      include: { account: true },
    })

    // Only send if no email has been sent today
    const alreadySent = await prisma.digestEmail.findFirst({
      where: { date: targetDate, status: "sent" },
    })

    if (!alreadySent && completedDigests.length > 0) {
      const { sendDailyDigestEmail } = await import("./email")
      const { generateDailySummaries } = await import("./summarizer")
      // Generate summaries first so they're available in the email
      await generateDailySummaries(targetDate).catch((err) =>
        console.error("[pipeline] summarizer failed:", err)
      )
      const emailPayload = completedDigests.map((d) => ({
        handle: d.account.handle,
        displayName: d.account.displayName,
        categories: d.account.categories,
        tierMap: d.account.tierMap as Record<string, number> | undefined,
        summary: d.summary!,
        sentiment: d.sentiment!,
        tickers: d.tickers,
        tickerData: d.tickerData as Record<string, { price?: number; change?: number; resolved: boolean }> | undefined,
      }))
      const freshSummaries = (await prisma.dailySummary.findMany({
        where: { date: targetDate },
      })) as Array<{ scope: string; content: object }>

      try {
        await sendDailyDigestEmail(targetDate, emailPayload, freshSummaries)
        await prisma.digestEmail.create({
          data: { date: targetDate, sentAt: new Date(), status: "sent" },
        })
      } catch (error) {
        await prisma.digestEmail.create({
          data: { date: targetDate, status: "failed", error: String(error) },
        })
      }
    }
  }

  return {
    batch: results.map((r, i) => ({
      handle: batch[i].handle,
      status: r.status,
      error: r.status === "rejected" ? String(r.reason) : undefined,
    })),
    completedToday: completedCount,
    totalActive,
    emailSent: isLastBatch,
  }
}

async function processAccount(
  account: { id: string; handle: string },
  date: Date,
  since: Date
) {
  console.log(`[pipeline] processing @${account.handle}`)

  // Upsert digest as pending
  await prisma.dailyDigest.upsert({
    where: { accountId_date: { accountId: account.id, date } },
    create: { accountId: account.id, date, status: "pending" },
    update: { status: "pending", error: null },
  })

  // Fetch tweets
  let rawTweets
  try {
    rawTweets = await fetchTweetsForAccount(account.handle, since)
    console.log(`[pipeline] @${account.handle}: fetched ${rawTweets.length} tweets`)
  } catch (error) {
    const msg = String(error)
    console.error(`[pipeline] @${account.handle}: tweet fetch failed — ${msg}`)
    await prisma.dailyDigest.update({
      where: { accountId_date: { accountId: account.id, date } },
      data: { status: "failed", error: msg },
    })
    throw error
  }

  // Upsert tweets
  await Promise.allSettled(
    rawTweets.map((t) =>
      prisma.tweet.upsert({
        where: { tweetId: t.tweetId },
        create: { ...t, accountId: account.id },
        update: {},
      })
    )
  )

  // Summarize
  let digestResult
  try {
    digestResult = await summarizeAccountTweets(account.handle, rawTweets)
  } catch (error) {
    const msg = String(error)
    console.error(`[pipeline] @${account.handle}: summarize failed — ${msg}`)
    await prisma.dailyDigest.update({
      where: { accountId_date: { accountId: account.id, date } },
      data: { status: "failed", error: msg },
    })
    throw error
  }

  // Fetch ticker prices
  let tickerData = {}
  if (digestResult.tickers.length > 0) {
    try {
      tickerData = await fetchTickerPrices(digestResult.tickers)
    } catch (err) {
      console.warn(`[pipeline] ticker price fetch failed for ${account.handle}:`, err)
    }
  }

  // Save digest
  await prisma.dailyDigest.update({
    where: { accountId_date: { accountId: account.id, date } },
    data: {
      summary: digestResult.summary,
      sentiment: digestResult.sentiment,
      tickers: digestResult.tickers,
      tickerData,
      keyTweetIds: digestResult.keyTweetIds,
      status: "complete",
      error: null,
    },
  })
  console.log(`[pipeline] @${account.handle}: complete`)
}
