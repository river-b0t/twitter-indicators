import { NextResponse, NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"

function isAuthed(request: NextRequest) {
  const cookie = request.cookies.get("site-auth")
  return cookie?.value === process.env.SITE_PASSWORD
}

export async function POST(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json() as {
    ids: string[]
    action: "delete" | "add-categories" | "remove-categories" | "set-tier"
    categories?: string[]
    category?: string
    tier?: number
  }

  const { ids, action, categories, category, tier } = body

  if (!ids?.length) return NextResponse.json({ error: "No IDs provided" }, { status: 400 })

  if (action === "delete") {
    await prisma.twitterAccount.deleteMany({ where: { id: { in: ids } } })
    return NextResponse.json({ ok: true, count: ids.length })
  }

  if (action === "add-categories") {
    if (!categories?.length) return NextResponse.json({ error: "No categories" }, { status: 400 })
    const existing = await prisma.twitterAccount.findMany({
      where: { id: { in: ids } },
      select: { id: true, categories: true },
    })
    await prisma.$transaction(
      existing.map((acc) => {
        const merged = Array.from(new Set([...acc.categories, ...categories]))
        return prisma.twitterAccount.update({ where: { id: acc.id }, data: { categories: merged } })
      })
    )
    return NextResponse.json({ ok: true })
  }

  if (action === "remove-categories") {
    if (!categories?.length) return NextResponse.json({ error: "No categories" }, { status: 400 })
    const existing = await prisma.twitterAccount.findMany({
      where: { id: { in: ids } },
      select: { id: true, categories: true },
    })
    await prisma.$transaction(
      existing.map((acc) => {
        const filtered = acc.categories.filter((c) => !categories.includes(c))
        return prisma.twitterAccount.update({ where: { id: acc.id }, data: { categories: filtered } })
      })
    )
    return NextResponse.json({ ok: true })
  }

  if (action === "set-tier") {
    if (!category) return NextResponse.json({ error: "category required" }, { status: 400 })
    if (tier === undefined || ![1, 2, 3].includes(tier)) {
      return NextResponse.json({ error: "tier must be 1, 2, or 3" }, { status: 400 })
    }
    const existing = await prisma.twitterAccount.findMany({
      where: { id: { in: ids } },
      select: { id: true, tierMap: true },
    })
    await prisma.$transaction(
      existing.map((acc) => {
        const currentMap = (acc.tierMap as Record<string, number>) ?? {}
        return prisma.twitterAccount.update({
          where: { id: acc.id },
          data: { tierMap: { ...currentMap, [category]: tier } },
        })
      })
    )
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 })
}
