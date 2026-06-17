import { prisma } from "../lib/prisma"
import { format } from "date-fns"

async function main() {
  const digests = await prisma.dailyDigest.findMany({
    where: { status: "complete" },
    include: { account: { select: { handle: true, categories: true } } },
    orderBy: { date: "desc" },
    take: 20,
  })
  for (const d of digests) {
    console.log(`\n--- @${d.account.handle} (${d.account.categories.join(", ")}) — ${format(d.date, "yyyy-MM-dd")} ---`)
    console.log(`Sentiment: ${d.sentiment}`)
    console.log(`Tickers: ${(d.tickers as string[]).join(", ") || "none"}`)
    console.log(`Summary: ${d.summary}`)
  }
}
main().catch(console.error).finally(() => prisma.$disconnect())
