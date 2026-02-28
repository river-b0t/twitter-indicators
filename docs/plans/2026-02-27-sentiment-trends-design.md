# Sentiment Trends Design

**Date:** 2026-02-27
**Project:** Twitter Indicators
**Status:** Approved

## Overview

A row of 30 colored squares on each account's drill-down page showing sentiment history for the last 30 days. Pure CSS, server-rendered, no chart library.

## Visual Design

- 30 squares, each 4px wide × 16px tall, arranged left-to-right (oldest → newest)
- Color encoding:
  - `bullish` → green-500
  - `bearish` → red-500
  - `mixed` → yellow-400
  - `neutral` → slate-400
  - No digest for that day → bg-slate-800 (dark, near-invisible)
- Native HTML `title` attribute on each square for tooltip: `"2026-02-25: bullish"` or `"2026-02-25: no data"`
- No hover effects, no chart library

## Placement

On `app/dashboard/[handle]/page.tsx`, rendered between the summary card (top of page) and the tweet list. Only renders if ≥2 historical digests exist for that account.

## Data Query

In the drill-down page server component, add a second query for the past 30 days of digests:

```ts
const thirtyDaysAgo = subDays(startOfDay(new Date()), 29)
const history = await prisma.dailyDigest.findMany({
  where: { accountId: account.id, date: { gte: thirtyDaysAgo } },
  select: { date: true, sentiment: true },
  orderBy: { date: "asc" },
})
```

Build a map of `dateStr → sentiment`, then iterate the 30-day window to produce one entry per day (null if missing).

## Component

New server component: `components/sentiment-history.tsx`

Props: `{ history: Array<{ date: Date; sentiment: string | null }> }`

Renders nothing if `history.filter(h => h.sentiment).length < 2`.

Otherwise renders the 30 squares inline-flex.

## Files

- Create: `components/sentiment-history.tsx` — server component, 30 squares
- Modify: `app/dashboard/[handle]/page.tsx` — add history query + render SentimentHistory
