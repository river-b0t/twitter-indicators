import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const accounts = await prisma.twitterAccount.findMany({ orderBy: { handle: "asc" } })
  return NextResponse.json(accounts)
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const body = await request.json()
  const account = await prisma.twitterAccount.create({ data: body })
  return NextResponse.json(account)
}
