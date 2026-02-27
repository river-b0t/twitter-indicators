// lib/finnhub.ts

export interface TickerEntry {
  price?: number
  change?: number   // daily % change, e.g. 2.4 means +2.4%
  resolved: boolean
}

export type TickerData = Record<string, TickerEntry>

/**
 * Fetch price + daily % change for an array of tickers from Finnhub.
 * Unresolvable tickers (unknown symbol, API error) return { resolved: false }.
 * Never throws — pipeline failure tolerance.
 */
export async function fetchTickerPrices(tickers: string[]): Promise<TickerData> {
  if (tickers.length === 0) return {}

  const apiKey = process.env.FINNHUB_API_KEY
  if (!apiKey) {
    console.warn("[finnhub] FINNHUB_API_KEY not set, skipping price fetch")
    return Object.fromEntries(tickers.map((t) => [t, { resolved: false }]))
  }

  const results = await Promise.allSettled(
    tickers.map((ticker) => fetchOne(ticker, apiKey))
  )

  const data: TickerData = {}
  for (let i = 0; i < tickers.length; i++) {
    const r = results[i]
    data[tickers[i]] =
      r.status === "fulfilled"
        ? r.value
        : { resolved: false }
  }
  return data
}

async function fetchOne(ticker: string, apiKey: string): Promise<TickerEntry> {
  const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(ticker)}&token=${apiKey}`
  const res = await fetch(url, { next: { revalidate: 0 } })

  if (!res.ok) return { resolved: false }

  const json = await res.json() as { c: number; dp: number }

  // Finnhub returns c=0 when symbol is unknown
  if (!json.c) return { resolved: false }

  return {
    price: json.c,
    change: Math.round(json.dp * 100) / 100,  // 2 decimal places
    resolved: true,
  }
}
