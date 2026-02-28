import { NextResponse, NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"

function isAuthed(request: NextRequest) {
  const cookie = request.cookies.get("site-auth")
  return cookie?.value === process.env.SITE_PASSWORD
}

export async function GET(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const rules = await prisma.alertRule.findMany({ orderBy: { createdAt: "asc" } })
  return NextResponse.json(rules)
}

export async function POST(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { keyword } = await request.json() as { keyword: string }
  if (!keyword?.trim()) return NextResponse.json({ error: "keyword required" }, { status: 400 })
  const rule = await prisma.alertRule.create({ data: { keyword: keyword.trim() } })
  return NextResponse.json(rule)
}
