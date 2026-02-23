import { prisma } from "./prisma"
import { fetchTweetsForAccount } from "./apify"
import { summarizeAccountTweets } from "./gemini"
import { startOfDay, subDays } from "date-fns"

export async function runDigestPipeline(date: Date = new Date()) {
  const targetDate = startOfDay(date)
  const since = subDays(targetDate, 1)

  const accounts = await prisma.twitterAccount.findMany({
    where: { active: true },
  })

  const results = await Promise.allSettled(
    accounts.map((account) => processAccount(account, targetDate, since))
  )

  // Send email after all accounts processed
  const completedDigests = await prisma.dailyDigest.findMany({
    where: { date: targetDate, status: "complete" },
    include: { account: true },
  })

  if (completedDigests.length > 0) {
    const { sendDailyDigestEmail } = await import("./email")
    const emailPayload = completedDigests.map((d) => ({
      handle: d.account.handle,
      displayName: d.account.displayName,
      categories: d.account.categories,
      summary: d.summary!,
      sentiment: d.sentiment!,
      tickers: d.tickers,
    }))

    try {
      await sendDailyDigestEmail(targetDate, emailPayload)
      await prisma.digestEmail.create({
        data: { date: targetDate, sentAt: new Date(), status: "sent" },
      })
    } catch (error) {
      await prisma.digestEmail.create({
        data: { date: targetDate, status: "failed", error: String(error) },
      })
    }
  }

  return results.map((r, i) => ({
    handle: accounts[i].handle,
    status: r.status,
    error: r.status === "rejected" ? String(r.reason) : undefined,
  }))
}

async function processAccount(
  account: { id: string; handle: string },
  date: Date,
  since: Date
) {
  // Upsert digest as pending
  await prisma.dailyDigest.upsert({
    where: { accountId_date: { accountId: account.id, date } },
    create: { accountId: account.id, date, status: "pending" },
    update: { status: "pending" },
  })

  // Fetch tweets
  const rawTweets = await fetchTweetsForAccount(account.handle, since)

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
    await prisma.dailyDigest.update({
      where: { accountId_date: { accountId: account.id, date } },
      data: { status: "failed" },
    })
    throw error
  }

  // Save digest
  await prisma.dailyDigest.update({
    where: { accountId_date: { accountId: account.id, date } },
    data: {
      summary: digestResult.summary,
      sentiment: digestResult.sentiment,
      tickers: digestResult.tickers,
      keyTweetIds: digestResult.keyTweetIds,
      status: "complete",
    },
  })
}
