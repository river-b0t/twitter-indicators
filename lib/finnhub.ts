// lib/finnhub.ts

// Maps common AI-generated ticker names to correct Finnhub symbols.
// Crypto needs exchange prefix; commodities map to liquid ETF proxies.
const SYMBOL_MAP: Record<string, string> = {
  // Major crypto — Binance
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
  SUI: "BINANCE:SUIUSDT",
  APT: "BINANCE:APTUSDT",
  ARB: "BINANCE:ARBUSDT",
  OP: "BINANCE:OPUSDT",
  TON: "BINANCE:TONUSDT",
  TAO: "BINANCE:TAOUSDT",
  HYPE: "BINANCE:HYPEUSDT",
  // Stocks + ETFs — Finnhub direct
  SPY: "SPY",
  QQQ: "QQQ",
  TLT: "TLT",
  GLD: "GLD",
  SLV: "SLV",
  USO: "USO",
  UUP: "UUP",   // Dollar index ETF
  NVDA: "NVDA",
  TSLA: "TSLA",
  AAPL: "AAPL",
  META: "META",
  GOOGL: "GOOGL",
  AMZN: "AMZN",
  MSFT: "MSFT",
  COIN: "COIN",
  MSTR: "MSTR",
  // Commodity ETF proxies
  GOLD: "GLD",
  SILVER: "SLV",
  OIL: "USO",
  XAU: "GLD",    // Gold spot → GLD proxy
  // Index/futures proxies via ETFs
  DXY: "UUP",   // Dollar index → dollar ETF
  NQ: "QQQ",    // Nasdaq futures → QQQ proxy
  ES: "SPY",    // S&P futures → SPY proxy
  SPX: "SPY",   // S&P 500 → SPY proxy
}

// Words that Gemini sometimes extracts as tickers but aren't traded assets
const SKIP_TICKERS = new Set([
  "CRYPTO", "DEFI", "NFTS", "NFT", "WEB3", "ALTCOINS", "ALTS",
  "IRAN", "CHINA", "RUSSIA", "UKRAINE", "US", "USA", "EU",
  "COMMODITIES", "MARKETS", "STOCKS", "BONDS", "EQUITIES",
  "FED", "FOMC", "SEC", "ETF", "DCA", "ATH", "ATL", "FOMO", "FUD",
  "AI", "ML", "API", "USD", "EUR", "GBP",
])

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
  const data: TickerData = {}

  // Filter out non-tickers
  const validTickers = tickers.filter((t) => !SKIP_TICKERS.has(t.toUpperCase()))

  await Promise.allSettled(validTickers.map(async (ticker) => {
    const upper = ticker.toUpperCase()
    const mapped = SYMBOL_MAP[upper]

    if (mapped && apiKey) {
      data[ticker] = await fetchOne(mapped, apiKey).catch(() => ({ resolved: false }))
    } else {
      data[ticker] = await fetchDexScreener(ticker).catch(() => ({ resolved: false }))
    }
  }))

  return data
}

async function fetchDexScreener(ticker: string): Promise<TickerEntry> {
  const url = `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(ticker)}`
  const res = await fetch(url, { next: { revalidate: 0 } })
  if (!res.ok) return { resolved: false }

  const json = await res.json() as { pairs?: Array<{ baseToken: { symbol: string }; priceUsd: string; priceChange?: { h24: number } }> }
  const pairs = json.pairs ?? []

  // Find first pair where base token symbol matches (case-insensitive)
  const match = pairs.find((p) => p.baseToken.symbol.toUpperCase() === ticker.toUpperCase())
  if (!match || !match.priceUsd) return { resolved: false }

  return {
    price: parseFloat(match.priceUsd),
    change: match.priceChange?.h24 != null ? Math.round(match.priceChange.h24 * 100) / 100 : undefined,
    resolved: true,
  }
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
