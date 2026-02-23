import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { runDigestPipeline } from "@/lib/pipeline"

export async function POST(request: Request) {
  const session = await auth()
  const authHeader = request.headers.get("authorization")
  const isCron = authHeader === `Bearer ${process.env.CRON_SECRET}`

  if (!session && !isCron) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const results = await runDigestPipeline()
    return NextResponse.json({ results })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
