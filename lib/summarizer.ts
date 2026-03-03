// lib/summarizer.ts
import { prisma } from "./prisma"
import { GoogleGenerativeAI } from "@google/generative-ai"

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" })

const CATEGORIES = ["traders", "crypto", "onchain", "vc", "tradfi", "thematic", "builders"] as const

// Approximate 50/30/20 weighting across tiers
const TIER_WEIGHT: Record<number, number> = { 1: 5, 2: 3, 3: 2 }

function tierWeight(tierMap: unknown, category: string): number {
  if (!tierMap || typeof tierMap !== "object" || Array.isArray(tierMap)) return 1
  const t = (tierMap as Record<string, number>)[category]
  return TIER_WEIGHT[t] ?? 1
}

function bestTierWeight(tierMap: unknown, categories: string[]): number {
  if (!categories.length) return 1
  return Math.max(...categories.map((c) => tierWeight(tierMap, c)))
}

function parseGeminiJson<T>(text: string): T {
  const cleaned = text.trim().replace(/^```json?\n?/, "").replace(/\n?```$/, "")
  return JSON.parse(cleaned) as T
}

export interface TickerConsensus {
  ticker: string
  weightedMentions: number
  consensus: string
  contrarian?: string
}

export interface CategorySummaryContent {
  text: string
  tickers: TickerConsensus[]
}

export interface GlobalSummaryContent {
  tickers: TickerConsensus[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DigestsWithAccount = any[]

export async function generateDailySummaries(date: Date): Promise<void> {
  const digests: DigestsWithAccount = await prisma.dailyDigest.findMany({
    where: { date, status: "complete" },
    include: { account: true },
  })

  if (digests.length === 0) return

  // Generate per-category summaries in parallel
  await Promise.allSettled(
    CATEGORIES.map((cat) => generateCategorySummary(date, cat, digests))
  )

  // Generate global summary after categories
  await generateGlobalSummary(date, digests).catch((err) =>
    console.error("[summarizer] global summary failed:", err)
  )
}

async function generateCategorySummary(
  date: Date,
  category: string,
  allDigests: DigestsWithAccount
) {
  const catDigests = allDigests.filter((d) => d.account.categories.includes(category))
  if (catDigests.length === 0) return

  // Sort by tier weight desc (tier 1 first)
  const sorted = [...catDigests].sort((a, b) =>
    tierWeight(b.account.tierMap, category) - tierWeight(a.account.tierMap, category)
  )

  const accountLines = sorted.map((d) => {
    const t = (d.account.tierMap as Record<string, number>)?.[category] ?? 3
    return `[Tier ${t}] @${d.account.handle}: ${d.summary}\nTickers: ${d.tickers.join(", ") || "none"}`
  }).join("\n\n")

  const prompt = `You are synthesizing what financial Twitter accounts in the "${category}" category are saying today.
Accounts are listed by tier (tier 1 = highest signal, weight most heavily).

${accountLines}

Write a 1-2 paragraph synthesis that captures key themes and views, calls out specific tickers and the prevailing view on each. Weight tier 1 accounts approximately 50%, tier 2 approximately 30%, tier 3 approximately 20%.

Then respond with JSON only (no markdown):
{"text":"...","tickers":[{"ticker":"BTC","weightedMentions":5,"consensus":"bullish — breakout likely","contrarian":"@handle sees rejection at resistance"}]}

Only include contrarian if a named account clearly contradicts the consensus. weightedMentions is approximate.`

  try {
    const result = await model.generateContent(prompt)
    const content = parseGeminiJson<CategorySummaryContent>(result.response.text())

    await prisma.dailySummary.upsert({
      where: { date_scope: { date, scope: category } },
      create: { date, scope: category, content: content as object },
      update: { content: content as object },
    })
    console.log(`[summarizer] ${category} summary done`)
  } catch (err) {
    console.error(`[summarizer] ${category} failed:`, err)
  }
}

async function generateGlobalSummary(
  date: Date,
  allDigests: DigestsWithAccount
) {
  // Weighted ticker mention counts
  const tickerWeights: Record<string, { weight: number; accountSummaries: string[] }> = {}

  for (const d of allDigests) {
    const w = bestTierWeight(d.account.tierMap, d.account.categories)
    for (const ticker of d.tickers) {
      if (!tickerWeights[ticker]) tickerWeights[ticker] = { weight: 0, accountSummaries: [] }
      tickerWeights[ticker].weight += w
      tickerWeights[ticker].accountSummaries.push(`@${d.account.handle}: ${d.summary}`)
    }
  }

  const top10 = Object.entries(tickerWeights)
    .sort((a, b) => b[1].weight - a[1].weight)
    .slice(0, 10)

  if (top10.length === 0) return

  const tickerBlocks = top10.map(([ticker, info]) => {
    const summaries = info.accountSummaries.slice(0, 6).join("\n")
    return `${ticker} (weighted mentions: ${info.weight}):\n${summaries}`
  }).join("\n\n---\n\n")

  const prompt = `For each of the following tickers/assets, summarize the consensus view from financial Twitter today and flag any notable contrarian take.

${tickerBlocks}

Respond with JSON only (no markdown):
{"tickers":[{"ticker":"BTC","weightedMentions":14,"consensus":"one-liner consensus view","contrarian":"optional contrarian note, omit key if none"}]}

Keep each consensus to one sentence. Only include contrarian if clearly present.`

  const result = await model.generateContent(prompt)
  const content = parseGeminiJson<GlobalSummaryContent>(result.response.text())

  await prisma.dailySummary.upsert({
    where: { date_scope: { date, scope: "global" } },
    create: { date, scope: "global", content: content as object },
    update: { content: content as object },
  })
  console.log("[summarizer] global summary done")
}
