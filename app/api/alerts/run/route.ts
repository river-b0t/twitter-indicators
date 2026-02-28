import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { Resend } from "resend"
import { AlertEmail } from "@/emails/alert"
import { subHours } from "date-fns"

const resend = new Resend(process.env.RESEND_API_KEY!)

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization")
  const isCron = authHeader === `Bearer ${process.env.CRON_SECRET}`
  if (!isCron) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    // Load active rules
    const rules = await prisma.alertRule.findMany({ where: { active: true } })
    if (!rules.length) {
      await prisma.alertRun.create({ data: { matchCount: 0, status: "no_matches" } })
      return NextResponse.json({ status: "no_matches", reason: "no active rules" })
    }

    // Determine time window: since last run, or 4 hours ago
    const lastRun = await prisma.alertRun.findFirst({ orderBy: { ranAt: "desc" } })
    const since = lastRun?.ranAt ?? subHours(new Date(), 4)

    // Load tweets in window, with account handle
    const tweets = await prisma.tweet.findMany({
      where: { postedAt: { gte: since } },
      include: { account: { select: { handle: true } } },
      orderBy: { postedAt: "desc" },
    })

    if (!tweets.length) {
      await prisma.alertRun.create({ data: { matchCount: 0, status: "no_matches" } })
      return NextResponse.json({ status: "no_matches", reason: "no new tweets" })
    }

    // Match tweets against each keyword (case-insensitive substring)
    const matchesByKeyword: Record<string, Array<{ handle: string; text: string; postedAt: Date; url: string }>> = {}
    for (const rule of rules) {
      const lower = rule.keyword.toLowerCase()
      const matches = tweets.filter((t) => t.text.toLowerCase().includes(lower))
      if (matches.length > 0) {
        matchesByKeyword[rule.keyword] = matches.map((t) => ({
          handle: t.account.handle,
          text: t.text,
          postedAt: t.postedAt,
          url: t.url,
        }))
      }
    }

    const totalMatches = Object.values(matchesByKeyword).reduce((n, arr) => n + arr.length, 0)

    if (totalMatches === 0) {
      await prisma.alertRun.create({ data: { matchCount: 0, status: "no_matches" } })
      return NextResponse.json({ status: "no_matches" })
    }

    // Send email
    const dashboardUrl = `${process.env.NEXTAUTH_URL}/dashboard`
    await resend.emails.send({
      from: process.env.RESEND_FROM!,
      to: process.env.DIGEST_TO!,
      subject: `[Alerts] ${totalMatches} keyword match${totalMatches !== 1 ? "es" : ""}`,
      react: AlertEmail({ matchesByKeyword, dashboardUrl }),
    })

    await prisma.alertRun.create({ data: { matchCount: totalMatches, status: "sent" } })
    return NextResponse.json({ status: "sent", matchCount: totalMatches })
  } catch (error) {
    await prisma.alertRun.create({ data: { matchCount: 0, status: "failed" } }).catch(() => {})
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
