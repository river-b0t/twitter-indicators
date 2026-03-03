import { Resend } from "resend"
import { DigestEmail } from "@/emails/digest"
import { format } from "date-fns"

const resend = new Resend(process.env.RESEND_API_KEY!)

export async function sendDailyDigestEmail(
  date: Date,
  digests: Array<{
    handle: string
    displayName: string
    categories: string[]
    tierMap?: Record<string, number>
    summary: string
    sentiment: string
    tickers: string[]
    tickerData?: Record<string, { price?: number; change?: number; resolved: boolean }>
  }>,
  summaries?: Array<{ scope: string; content: object }>
) {
  const dateStr = format(date, "EEEE, MMMM d, yyyy")
  const dashboardUrl = `${process.env.NEXTAUTH_URL}/digest?date=${format(date, "yyyy-MM-dd")}`

  await resend.emails.send({
    from: process.env.RESEND_FROM!,
    to: process.env.DIGEST_TO!,
    subject: `Timeline Digest — ${dateStr}`,
    react: DigestEmail({ date: dateStr, digests, summaries, dashboardUrl }),
  })
}
