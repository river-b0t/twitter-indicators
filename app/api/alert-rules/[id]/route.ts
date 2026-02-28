import { NextResponse, NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"

function isAuthed(request: NextRequest) {
  const cookie = request.cookies.get("site-auth")
  return cookie?.value === process.env.SITE_PASSWORD
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  const { active } = await request.json() as { active: boolean }
  const rule = await prisma.alertRule.update({ where: { id }, data: { active } })
  return NextResponse.json(rule)
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  await prisma.alertRule.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
