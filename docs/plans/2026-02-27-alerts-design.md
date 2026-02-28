# Alerts Feature Design

**Date:** 2026-02-27
**Project:** Twitter Indicators
**Status:** Approved

## Overview

Keyword-based alert system. A cron runs every 4 hours, scans all tweets collected since last run, and emails matching tweets grouped by keyword. Zero AI or paid API usage.

## Data Models

Two new Prisma models:

```prisma
model AlertRule {
  id        String   @id @default(cuid())
  keyword   String
  active    Boolean  @default(true)
  createdAt DateTime @default(now())
}

model AlertRun {
  id         String   @id @default(cuid())
  ranAt      DateTime @default(now())
  matchCount Int
  status     String   // "sent" | "no_matches" | "failed"
}
```

## Matching Logic

- Scan all `Tweet` rows where `postedAt >= lastRun.ranAt` (or last 4 hours if no run exists)
- For each active `AlertRule`, case-insensitive substring match on `tweet.text`
- Group matched tweets by keyword
- If any matches: send email, create AlertRun with status "sent"
- If no matches: create AlertRun with status "no_matches" (no email)

## Settings > Alerts Page

Route: `/settings/alerts`

UI:
- Page header: "Alerts"
- Input + "Add" button to create new keyword rules
- List of existing rules: keyword text, active toggle (Switch), delete button
- Empty state: "No alert rules yet. Add a keyword to get started."

CRUD:
- `GET /api/alert-rules` — list all rules
- `POST /api/alert-rules` — create rule `{ keyword }`
- `PATCH /api/alert-rules/[id]` — toggle active `{ active: boolean }`
- `DELETE /api/alert-rules/[id]` — delete rule

## Cron Endpoint

`POST /api/alerts/run` — bearer auth via `CRON_SECRET`

Logic:
1. Load all active AlertRules
2. Load last AlertRun (to determine time window)
3. Query tweets since window start (JOIN account for handle context)
4. Match tweets against each keyword
5. If matches exist: send grouped email via Resend, write AlertRun(status="sent")
6. Else: write AlertRun(status="no_matches")

## Email Format

Subject: `[Alerts] {N} keyword matches`

Body:
- One section per matched keyword
- Each section: keyword heading + bulleted tweet list with `@handle: tweet text (time ago)`
- Plain but readable; React Email template

## Cron Schedule

Add to `vercel.json`:
```json
{ "path": "/api/alerts/run", "schedule": "0 */4 * * *" }
```

Vercel Hobby allows 2 crons. Currently using 1 (`0 16 * * *` for digests). This stays within limit.

## Cost

- Gemini: none
- Finnhub: none
- Resend: free tier 3,000 emails/month; at 6 emails/day this is ~180/month
- Vercel: within 2-cron Hobby limit
- Neon: no additional queries beyond current load

Total: $0/month

## Files

- Modify: `prisma/schema.prisma` — add AlertRule, AlertRun models
- Create: `app/settings/alerts/page.tsx` — Alerts settings page
- Modify: `components/nav.tsx` — add "Alerts" link under Settings
- Create: `app/api/alert-rules/route.ts` — GET + POST
- Create: `app/api/alert-rules/[id]/route.ts` — PATCH + DELETE
- Create: `app/api/alerts/run/route.ts` — cron endpoint
- Create: `emails/alert.tsx` — React Email template
- Modify: `vercel.json` — add second cron
