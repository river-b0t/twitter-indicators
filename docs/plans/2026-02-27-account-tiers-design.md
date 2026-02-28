# Account Tiers — Design

> Date: 2026-02-27

## Goal

Add a 1/2/3 tier system to Twitter accounts so high-signal accounts float to the top and can be filtered independently of (but composably with) categories.

## Schema

```prisma
model TwitterAccount {
  // ... existing fields ...
  tier Int @default(2)  // 1=high signal, 2=default, 3=low signal
}
```

Migration: add `tier` column with default 2. All existing accounts get tier 2.

## API

- `PATCH /api/accounts/[id]` — already accepts any field, just pass `{ tier: 1 }`
- `POST /api/accounts/bulk` — add `set-tier` action: `{ ids: [...], action: "set-tier", tier: 1 }`

## Settings > Accounts

- Per-row: tier pill selector (1 / 2 / 3) inline next to active toggle
- Bulk actions bar: add "Set tier" with 1/2/3 options
- Account list shows current tier

## Dashboard

- **Default sort**: tier ASC, then handle ASC — tier 1 accounts float to top
- **Filter**: add "T1 / T2 / T3 / All" toggle alongside existing category filter
- Tier filter composes with category filter (e.g., tier 1 traders)
- No visual weight difference on cards — sort + filter only

## Accuracy Score (future — Option B)

Parked for a future session. Approach: per-ticker automated scoring.
- Extract primary sentiment asset from digest tickers (default to BTC if none)
- Fetch historical prices from CoinGecko at digest date + N days
- Category-based windows: traders → 3d, crypto/onchain → 7d, vc/tradfi/thematic → 30d, builders → excluded
- Score only `bullish` and `bearish` (skip neutral/mixed)
- Store scored predictions in a new `SentimentPrediction` table
- Display rolling accuracy % on account cards and detail pages
