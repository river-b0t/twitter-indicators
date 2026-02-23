# Twitter Market Indicators Digest — Design Doc

> Created: 2026-02-23
> Status: Approved, ready for implementation

---

## Overview

Standalone daily digest tool that aggregates tweets from key market accounts, runs batched LLM summarization per account, and surfaces results via a web dashboard + daily email. Personal tool for Wally, single-user.

---

## Architecture

```
Vercel Cron (8 AM PT)
  └── /api/digest/run
        ├── Apify Twitter Scraper → fetch last 24h tweets per account
        ├── Write raw tweets → Supabase (Tweet table)
        ├── Gemini Flash 2.0 (batch per account) → DailyDigest record
        └── Resend → daily email digest
```

On-demand: same `/api/digest/run` endpoint triggered from dashboard Refresh button.

---

## Data Models

### TwitterAccount
| Field | Type | Notes |
|-------|------|-------|
| id | uuid | PK |
| handle | string | e.g. "unusual_whales" |
| displayName | string | |
| category | enum | crypto, tradfi, onchain, traders, thematic |
| avatarUrl | string | |
| active | boolean | toggle to pause without deleting |
| createdAt | datetime | |

### Tweet
| Field | Type | Notes |
|-------|------|-------|
| id | uuid | PK |
| tweetId | string | unique, Twitter's ID |
| accountId | uuid | FK → TwitterAccount |
| text | string | |
| postedAt | datetime | |
| likesCount | int | |
| retweetsCount | int | |
| url | string | link back to X |

### DailyDigest
| Field | Type | Notes |
|-------|------|-------|
| id | uuid | PK |
| accountId | uuid | FK → TwitterAccount |
| date | date | unique with accountId |
| summary | string | LLM-generated paragraph |
| sentiment | enum | bullish, bearish, neutral, mixed |
| tickers | string[] | tickers mentioned |
| keyTweetIds | string[] | tweetIds worth highlighting |
| status | enum | pending, complete, failed |

Unique constraint: `(accountId, date)` — upsert on conflict.

### DigestEmail
| Field | Type | Notes |
|-------|------|-------|
| id | uuid | PK |
| date | date | |
| sentAt | datetime | |
| status | enum | sent, failed |
| error | string? | error message if failed |

---

## Tech Stack

| Layer | Choice | Notes |
|-------|--------|-------|
| Framework | Next.js 14 App Router | TypeScript strict mode |
| Styling | Tailwind CSS + shadcn/ui | |
| ORM | Prisma | |
| Database | Supabase (PostgreSQL) | |
| Tweet fetching | Apify Twitter Scraper | JS client, pay-per-use ~$15-20/month |
| LLM | Gemini Flash 2.0 | `@google/generative-ai`, free tier (1500 req/day) |
| Email | Resend + React Email | Free tier covers 30 emails/month |
| Cron | Vercel Cron Jobs | Daily 8 AM PT |
| Auth | NextAuth v5 | Single-user, email+password |
| Deployment | Vercel | |

**Estimated monthly cost:** ~$65-70 (Apify ~$15-20, Supabase Pro $25, Vercel Pro $20, Gemini/Resend $0)

---

## Dashboard UI

### Main Digest View (default)
- Date picker (default: today) + Refresh button (on-demand fetch)
- Category filter pills: All | Crypto | TradFi | Onchain | Traders | Thematic
- Account cards grid:
  - Avatar, handle, sentiment badge (color-coded)
  - LLM summary paragraph
  - Ticker chips
  - Tweet count + drilldown link

### Tweet Drilldown View
- Full tweet list for selected account + date
- Chronological order, engagement stats, link to original on X

### Settings / Accounts
- Table of monitored accounts: handle, category, active toggle
- Add / remove accounts
- Manual "Run digest now" button

---

## Email Digest

- **Trigger:** Vercel Cron, 8 AM PT daily
- **Subject:** `Market Digest — [Day, Month Date]`
- **Structure:**
  1. Header: date + sentiment summary (e.g., "8 bullish · 3 bearish · 4 mixed")
  2. Sections by category — handle + 1-sentence summary + tickers
  3. Footer: link to dashboard
- **Template:** React Email component, plain HTML, no images
- **Delivery:** Resend, logged to DigestEmail table

---

## LLM Strategy (Batched per Account)

One Gemini Flash 2.0 call per account per day. Prompt includes all tweets from that account for the day. Output:
- `summary`: 2-3 sentence summary of key themes
- `sentiment`: bullish | bearish | neutral | mixed
- `tickers`: array of mentioned tickers/assets
- `keyTweetIds`: 1-3 tweet IDs most worth reading

This keeps API calls to ~50/day (well within Gemini's 1,500/day free tier).

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Apify fetch fails for an account | Log, skip account, continue batch |
| Gemini call fails | Retry once; store digest with `status: failed`, show "unavailable" in UI |
| Email send fails | Log to DigestEmail with error; no auto-retry |
| On-demand refresh | Returns partial results; UI shows per-account success/fail |
| Duplicate run | Upsert on `(accountId, date)` — safe to re-run |

---

## Testing

- `scripts/test-pipeline.ts` — smoke test: runs full pipeline for one account, logs output
- Run manually before deploying changes
- Vercel preview deployments for UI verification

---

## Phasing

**Phase 1 (MVP):** Dashboard + daily email digest
- Account management (seed list + editable)
- Tweet fetching via Apify
- Batched Gemini summarization
- Dashboard with category filters + drilldown
- Daily email via Resend

**Phase 2 (later):**
- Real-time alerts for keyword/account triggers
- Ticker integration (auto-fetch price context for mentioned assets)
- Sentiment trend charts per account over time
- Integration with market-indicators-dashboard

---

## Open Questions

- Which accounts to seed? (Wally to provide initial list)
- Apify actor choice: official Apify Twitter Scraper vs community actor (confirm before build)
