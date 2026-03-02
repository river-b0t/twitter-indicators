# Daily Summaries Design

> Date: 2026-03-01
> Feature: Tier-weighted per-category and global summaries

## Overview

Add AI-generated daily summaries at two levels:
1. **Per-category**: 1-2 paragraph synthesis of what accounts in each category are saying, weighted by tier (tier 1 > 2 > 3), with specific tickers called out
2. **Global**: Top 10 most-referenced tickers/ideas across all accounts (tier-weighted mention counts), with a one-liner consensus and a contrarian note where applicable

Summaries are generated once per day at email-send time, stored in a new `DailySummary` table, surfaced on the dashboard (collapsible panels above account cards), and included in the daily email.

---

## Schema

### New model: `DailySummary`

```prisma
model DailySummary {
  id      String   @id @default(cuid())
  date    DateTime @db.Date
  scope   String   // category slug or "global"
  content Json
  @@unique([date, scope])
}
```

### `content` shape

**Category scope:**
```ts
{
  text: string           // 1-2 paragraph AI-generated narrative
  tickers: Array<{
    ticker: string
    weightedMentions: number
    consensus: string    // e.g. "bullish — breakout above $65k expected"
    contrarian?: string  // e.g. "@trader_x sees rejection at resistance"
  }>
}
```

**Global scope (`scope = "global"`):**
```ts
{
  tickers: Array<{
    ticker: string
    weightedMentions: number
    consensus: string
    contrarian?: string
  }>  // top 10, sorted by weightedMentions desc
}
```

### Migration

`prisma/migrations/20260301_add_daily_summary/migration.sql`:
```sql
CREATE TABLE "DailySummary" (
  "id"      TEXT NOT NULL,
  "date"    DATE NOT NULL,
  "scope"   TEXT NOT NULL,
  "content" JSONB NOT NULL,
  CONSTRAINT "DailySummary_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DailySummary_date_scope_key" ON "DailySummary"("date", "scope");
```

---

## Generation: `lib/summarizer.ts`

New module, called from `lib/pipeline.ts` at email-send time (after all digests complete).

### Tier weighting

```
tier 1 → weight 3
tier 2 → weight 2
tier 3 → weight 1
default (unset) → weight 1
```

### Per-category summary

For each category in `["traders", "crypto", "onchain", "vc", "tradfi", "thematic", "builders"]`:

1. Fetch all `DailyDigest` records (status=complete) for accounts that have this category in their `categories[]`
2. For each account, look up `tierMap[category]` to get the tier (default 2 if unset)
3. Sort accounts by tier ASC (tier 1 first)
4. Build Gemini prompt:

```
You are synthesizing what financial Twitter accounts in the "{category}" category
are saying today. Accounts are listed by tier (tier 1 = highest signal).

{for each account, sorted by tier:}
[Tier {n}] @{handle}: {summary}
Tickers mentioned: {tickers.join(", ")}

Write a 1-2 paragraph synthesis that:
- Captures the key themes and views in this category today
- Calls out specific tickers being discussed and the prevailing view on each
- Weights tier 1 accounts more heavily than tier 2/3

Then output a JSON object (no markdown):
{
  "text": "...",
  "tickers": [
    { "ticker": "BTC", "consensus": "bullish — ...", "contrarian": "@handle disagrees because ..." }
  ]
}
Only include contrarian if a named account clearly contradicts the consensus.
```

5. Parse response, upsert `DailySummary` for `scope = category`.

### Global summary

1. Aggregate all ticker mentions across all complete digests for the date
2. For each account mentioning a ticker, add `weight = getTierWeight(tierMap, categories)` (best tier across all categories)
3. Sort tickers by `weightedMentions` desc, take top 10
4. For each of the top 10 tickers, collect the account summaries that mention it
5. Single Gemini prompt listing all 10 tickers with their mentioning accounts' summaries, requesting consensus + contrarian per ticker

```
For each of the following tickers, summarize the consensus view and flag any contrarian takes.

BTC (mentioned by: [tier1 accounts...], [tier2...]):
{relevant summaries}

ETH (...):
...

Output JSON (no markdown):
{
  "tickers": [
    {
      "ticker": "BTC",
      "weightedMentions": 14,
      "consensus": "one-liner",
      "contrarian": "optional"
    }
  ]
}
```

6. Upsert `DailySummary` for `scope = "global"`.

### Error handling

- If a category has 0 complete digests → skip (no record written)
- If Gemini fails for a category → log error, continue with other categories
- If global summary fails → log error, don't block email send
- All summarizer errors are non-fatal to the pipeline

### Timing

Summarizer runs after `sendDailyDigestEmail()` succeeds. Total added time: ~15-25s (8 sequential Gemini calls at ~2s each). Runs inside the no-op email check path so it executes even when all accounts were already processed.

---

## Pipeline changes: `lib/pipeline.ts`

In the "all accounts complete" block (both the post-batch path and the no-op path):

```ts
// After email send succeeds:
import { generateDailySummaries } from "./summarizer"
await generateDailySummaries(targetDate).catch((err) =>
  console.error("[pipeline] summarizer failed:", err)
)
```

The `generateDailySummaries` function is called with the target date and handles all categories + global internally.

---

## Dashboard UI

### `components/DailySummaryPanel.tsx` (new)

Collapsible panel displayed above the account card grid on `/dashboard`.

Structure:
```
┌─────────────────────────────────────────────────┐
│ MARKET OVERVIEW           [collapse ▲]          │
│                                                 │
│ GLOBAL TOP 10                                   │
│  BTC   14 refs   bullish — breakout likely      │
│                  ⚠ @beartrader sees rejection   │
│  ETH    9 refs   neutral — range-bound          │
│  SOL    7 refs   bullish — ecosystem momentum   │
│  ...                                            │
│                                                 │
│ BY CATEGORY                                     │
│  ▶ CRYPTO    ▶ TRADERS    ▶ ONCHAIN  ...        │
│                                                 │
│  [expanded category]:                           │
│  Paragraph 1...                                 │
│  Paragraph 2...                                 │
│  BTC · bullish consensus · @handle disagrees   │
└─────────────────────────────────────────────────┘
```

Props:
```ts
interface DailySummaryPanelProps {
  date: string  // "yyyy-MM-dd" for DB query
}
```

Data fetching: server component, queries `DailySummary` for the given date directly via Prisma.

Category tabs: pill buttons for each category that has a summary. Clicking expands that category's text + tickers inline.

### Dashboard page changes

`app/dashboard/page.tsx`: fetch `DailySummary` records for the date and pass to `DailySummaryPanel`. Replace or supplement the existing `SummaryBox` (keep `SummaryBox` as-is for filtered views; show `DailySummaryPanel` only when no category/tier filter is active, i.e. viewing "all").

---

## Email changes: `emails/digest.tsx`

Add two new sections between the sentiment count line and the per-account sections:

**Section 1 — Global top 10:**
```
TOP REFERENCES TODAY
BTC · bullish — breakout above $65k expected
ETH · neutral — range-bound between $1,900-$2,100
...
```

**Section 2 — Category summaries:**
```
CRYPTO
[paragraph text]

TRADERS
[paragraph text]
...
```

The email template receives `summaries: DailySummary[]` as an additional prop, filtered to the day's summaries. `sendDailyDigestEmail` in `lib/email.ts` is updated to accept and pass this data.

---

## File summary

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add `DailySummary` model |
| `prisma/migrations/20260301_add_daily_summary/` | New migration |
| `lib/summarizer.ts` | New — generates category + global summaries |
| `lib/pipeline.ts` | Call `generateDailySummaries` after email send |
| `lib/email.ts` | Accept `summaries` param, pass to template |
| `emails/digest.tsx` | Add global + category summary sections |
| `components/DailySummaryPanel.tsx` | New — collapsible dashboard panel |
| `app/dashboard/page.tsx` | Fetch summaries, render panel |

---

## Open questions / non-goals

- No retroactive backfill for past days (summaries only exist for days after this ships)
- No per-account filtering of the summary panel (always shows all-account view)
- Category summaries only generated for categories with ≥1 complete digest
