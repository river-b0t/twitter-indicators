import { NextResponse } from "next/server"
import { generateDailySummaries } from "@/lib/summarizer"
import { startOfDay, parseISO } from "date-fns"

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const body = await request.json().catch(() => ({}))
  const date = body.date ? startOfDay(parseISO(body.date)) : startOfDay(new Date())
  await generateDailySummaries(date)
  return NextResponse.json({ ok: true })
}
