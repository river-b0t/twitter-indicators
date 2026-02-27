// lib/summary.ts
// Pure aggregation helper — no I/O, no async.
// Takes per-account digest data already fetched by the dashboard page.

import type { TickerData } from "@/lib/finnhub"

export interface DigestInput {
  summary: string | null
  sentiment: string | null
  tickers: string[]
  tickerData: TickerData | null
  account: { handle: string }
}

export interface TickerSummary {
  ticker: string
  price?: number
  change?: number
  resolved: boolean
  mentionCount: number
  sentimentLabel: string  // e.g. "bullish consensus (4 accounts)" or "3 bullish, 1 bearish"
}

export interface CategorySummary {
  completedCount: number
  overviewText: string
  tickers: TickerSummary[]  // sorted by mentionCount desc
  highlights: Array<{ handle: string; text: string }>
}

export function aggregateDigests(digests: DigestInput[]): CategorySummary {
  const completed = digests.filter((d) => d.sentiment !== null && d.summary !== null)

  if (completed.length === 0) {
    return { completedCount: 0, overviewText: "", tickers: [], highlights: [] }
  }

  // Sentiment distribution
  const dist: Record<string, number> = {}
  for (const d of completed) {
    if (d.sentiment) dist[d.sentiment] = (dist[d.sentiment] ?? 0) + 1
  }

  // Dominant sentiment
  const sorted = Object.entries(dist).sort((a, b) => b[1] - a[1])
  const [dominant, dominantCount] = sorted[0]
  const total = completed.length

  // 2-sentence overview
  const sentimentPhrase =
    dominantCount === total
      ? `${dominant} (${total}/${total})`
      : `predominantly ${dominant} (${dominantCount}/${total})`
  const overviewText = `${total} account${total === 1 ? "" : "s"} posting today. Sentiment is ${sentimentPhrase}.`

  // Ticker aggregation
  const tickerMentions: Record<string, {
    count: number
    sentiments: string[]
    price?: number
    change?: number
    resolved: boolean
  }> = {}

  for (const d of completed) {
    for (const t of d.tickers) {
      if (!tickerMentions[t]) {
        tickerMentions[t] = { count: 0, sentiments: [], resolved: false }
      }
      tickerMentions[t].count++
      if (d.sentiment) tickerMentions[t].sentiments.push(d.sentiment)
      // First resolved tickerData entry wins
      const entry = d.tickerData?.[t]
      if (!tickerMentions[t].resolved && entry?.resolved) {
        tickerMentions[t].price = entry.price
        tickerMentions[t].change = entry.change
        tickerMentions[t].resolved = true
      }
    }
  }

  const tickers: TickerSummary[] = Object.entries(tickerMentions)
    .sort((a, b) => b[1].count - a[1].count)
    .map(([ticker, info]) => ({
      ticker,
      price: info.price,
      change: info.change,
      resolved: info.resolved,
      mentionCount: info.count,
      sentimentLabel: buildSentimentLabel(info.sentiments, info.count),
    }))

  // Highlights: up to 2 accounts, first sentence of their summary
  const highlights = completed.slice(0, 2).map((d) => ({
    handle: d.account.handle,
    text: firstSentence(d.summary!),
  }))

  return { completedCount: total, overviewText, tickers, highlights }
}

function buildSentimentLabel(sentiments: string[], total: number): string {
  const dist: Record<string, number> = {}
  for (const s of sentiments) dist[s] = (dist[s] ?? 0) + 1

  const sorted = Object.entries(dist).sort((a, b) => b[1] - a[1])
  if (sorted.length === 0) return `${total} mention${total === 1 ? "" : "s"}`

  const [top, topCount] = sorted[0]
  if (topCount === total) return `${top} consensus (${total} account${total === 1 ? "" : "s"})`
  if (sorted.length === 1) return `${top} (${topCount}/${total})`

  const [second, secondCount] = sorted[1]
  return `${topCount} ${top}, ${secondCount} ${second}`
}

function firstSentence(text: string): string {
  const match = text.match(/^[^.!?]+[.!?]/)
  const sentence = match ? match[0].trim() : text
  return sentence.length > 140 ? sentence.slice(0, 140) + "..." : sentence
}
