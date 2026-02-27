# Ticker Integration Design

**Date:** 2026-02-27
**Project:** Twitter Indicators
**Status:** Approved

## Overview

Enrich the tickers Gemini already extracts from tweets with live price data (price + daily % change) from Finnhub, snapshotted at digest time and displayed in the dashboard, drill-down page, and email.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Fetch timing | During pipeline | Prices are contextually tied to digest time; snapshot makes sense |
| Storage | JSON field on DailyDigest | No new tables; fits existing pattern |
| Price fields | Price + daily % change | Minimal, high-signal |
| Unknown tickers | Flag with `?` | Gemini hallucinates symbols; silent failure is confusing |
| Display locations | AccountCard, drill-down, email | All three surfaces |
| API provider | Finnhub free tier | 60 req/min, real-time US data, no cost |

## Schema Change

Add to `DailyDigest` in `prisma/schema.prisma`:

```prisma
tickerData  Json?
```

Shape:
```typescript
type TickerData = {
  [ticker: string]: {
    price?: number
    change?: number  // daily % change
    resolved: boolean
  }
}
```

Migration: `20260227_add_ticker_data`

## New File: `lib/finnhub.ts`

- `fetchTickerPrices(tickers: string[]): Promise<TickerData>`
- Calls Finnhub `/api/v1/quote?symbol=<ticker>&token=<key>` per ticker concurrently via `Promise.all`
- Unresolved (404, empty, or error) → `{ resolved: false }`
- Env var: `FINNHUB_API_KEY`
- Pipeline failure tolerance: if Finnhub throws, log and continue — no pipeline failure

## Pipeline Change (`lib/pipeline.ts`)

After Gemini returns tickers, before saving digest:

```typescript
let tickerData: TickerData = {}
if (digest.tickers.length > 0) {
  tickerData = await fetchTickerPrices(digest.tickers)
}
// include tickerData in updateDigest call
```

## UI Changes

### AccountCard (`components/account-card.tsx`)
- Resolved ticker: `BTC $94,000 (+2.4%)` — colored badge (green/red for +/-)
- Unresolved ticker: `SPY ?` — muted styling

### Drill-down (`app/dashboard/[handle]/page.tsx`)
- Same enriched badges, larger/more spaced
- Full ticker section under summary

### Email (`emails/digest.tsx`)
- Resolved: `BTC $94,000 (+2.4%)`
- Unresolved: plain symbol only

## Env Vars

- `FINNHUB_API_KEY` — add to Vercel + `.env.example`
