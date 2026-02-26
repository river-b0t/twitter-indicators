import { NextResponse, NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"

function isAuthed(request: NextRequest) {
  const cookie = request.cookies.get("site-auth")
  return cookie?.value === process.env.SITE_PASSWORD
}

export async function GET(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const accounts = await prisma.twitterAccount.findMany({ orderBy: { handle: "asc" } })
  return NextResponse.json(accounts)
}

export async function POST(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const body = await request.json()
  const account = await prisma.twitterAccount.create({ data: body })
  return NextResponse.json(account)
}
