// lib/finnhub.ts

// Maps common AI-generated ticker names to correct Finnhub symbols.
// Crypto needs exchange prefix; commodities map to liquid ETF proxies.
const SYMBOL_MAP: Record<string, string> = {
  BTC: "BINANCE:BTCUSDT",
  ETH: "BINANCE:ETHUSDT",
  SOL: "BINANCE:SOLUSDT",
  XRP: "BINANCE:XRPUSDT",
  DOGE: "BINANCE:DOGEUSDT",
  ADA: "BINANCE:ADAUSDT",
  AVAX: "BINANCE:AVAXUSDT",
  LINK: "BINANCE:LINKUSDT",
  DOT: "BINANCE:DOTUSDT",
  MATIC: "BINANCE:MATICUSDT",
  POL: "BINANCE:POLUSDT",
  BNB: "BINANCE:BNBUSDT",
  LTC: "BINANCE:LTCUSDT",
  BCH: "BINANCE:BCHUSDT",
  GOLD: "GLD",   // SPDR Gold Shares ETF
  SILVER: "SLV", // iShares Silver Trust ETF
  OIL: "USO",    // US Oil Fund ETF
}

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

  const resolved = tickers.map((t) => SYMBOL_MAP[t.toUpperCase()] ?? t)

  const results = await Promise.allSettled(
    resolved.map((symbol) => fetchOne(symbol, apiKey))
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
