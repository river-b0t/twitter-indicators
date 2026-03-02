import { prisma } from "../lib/prisma"

async function main() {
  const accounts = await prisma.twitterAccount.findMany({
    select: { handle: true, categories: true, tierMap: true, active: true },
    orderBy: { handle: "asc" },
  })

  const untiered = accounts.filter((a) => {
    const tm = (a.tierMap as Record<string, number>) ?? {}
    // Check if any of their categories have no tier set
    return a.categories.some((c) => tm[c] === undefined)
  })

  console.log(`Accounts with at least one category missing a tier: ${untiered.length}\n`)
  for (const a of untiered) {
    const tm = (a.tierMap as Record<string, number>) ?? {}
    const missing = a.categories.filter((c) => tm[c] === undefined)
    console.log(`@${a.handle} — missing: [${missing.join(", ")}] — all: [${a.categories.join(", ")}]`)
  }
}

main().catch(console.error).finally(() => prisma.$disconnect())
