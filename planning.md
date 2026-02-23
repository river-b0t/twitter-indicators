# Twitter Market Indicators - Planning Doc

## Project Overview
Daily digest tool that aggregates tweets from key market accounts (traders, analysts, funds) and surfaces their thoughts on market trends, trades, and sentiment. Goal: centralized market intelligence without Twitter scrolling.

## Discovery Questions for Claude Code Interview

Use these questions to fully scope the project requirements. Answer each to clarify scope, MVP, and phasing.

### 1. Account Selection & Sources
- **Which accounts** do you want to monitor? (List specific Twitter handles or criteria like "crypto traders," "hedge funds," "specific analysts")
- Do you have the list already, or should this be configurable/editable in the tool?
- **Data sources** — Twitter API only, or mix in other sources (newsletters, Substack, blogs, Discord, etc.)?
- Should we include retweets/replies, or just original tweets from the core accounts?

### 2. Summary & Content Strategy
- **Summary approach:**
  - Full tweet extraction + LLM auto-summarization?
  - Just flag tweets you mark as important manually?
  - Extract key tweets by keyword/sentiment only?
  - All of the above with configurable filters?
- **What constitutes "key"?** (e.g., trade announcements, portfolio moves, market calls, specific tickers mentioned)
- Do you want **sentiment analysis** (bullish/bearish/neutral) per tweet or per account?
- Should we **highlight specific tickers/markets** mentioned in tweets?

### 3. Output & Consumption
- **Primary output format:**
  - Web dashboard (real-time view)?
  - Daily email digest (timing: 9 AM PT?)?
  - Mobile app / PWA?
  - Slack/Telegram notifications?
  - Multiple formats?
- **Dashboard features** (if web):
  - Search/filter by account, date, ticker, sentiment?
  - Bookmark/save important tweets?
  - Link to original tweet on Twitter?
  - Charts/stats on account activity/sentiment over time?

### 4. Integration & Context
- Does this **tie into your existing tools** (market-indicators-dashboard, portfolio tracking, trading tools)?
- Should trades/positions mentioned in tweets **link to your actual positions**?
- Should we auto-fetch related **market data** (price, volume) for mentioned tickers?
- **Standalone first**, or integrated into a larger system?

### 5. Cadence & Alerts
- **Daily digest only**, or do you want real-time alerts for certain keywords/accounts?
- Which accounts warrant **instant notifications** vs. daily summary?
- Should we batch by **time window** (market hours 9:30-4 PM, or all hours)?

### 6. MVP Scope
- What's the **minimum viable product** to get value in your hands?
  - Suggested MVP: Simple web dashboard showing tweets from manual account list, grouped by account, with LLM-generated 1-sentence summary + sentiment tag. Daily email digest at 9 AM PT with top tweets from previous day.
- What would you **cut to ship fastest**?
- What features are **essential vs. nice-to-have**?

### 7. Tech & Deployment
- Any **tech stack preferences**? (Assume TypeScript + React/Next.js + Supabase, but confirm)
- **Deployment target?** (Vercel, Railway, etc.)
- **Data persistence** — store tweets in a DB for historical search, or fresh pull daily?
- **Twitter API access** — do you have v2 API credentials, or should we use alternative services?

### 8. Success Metrics
- How will you **know this is working**?
- Are we optimizing for **speed** (how fast you get the summary), **completeness** (don't miss important tweets), or **signal clarity** (minimize noise)?

## Notes
- These questions cover MVP scope, phasing, and feature prioritization
- Once answered, we can build a full PRD, architecture, and tech-stack doc
- Suggest starting with **dashboard + daily email digest** as Phase 1, add real-time alerts in Phase 2
