# UI Redesign Design

**Date:** 2026-02-27
**Project:** Twitter Indicators
**Status:** Approved
**Reference:** US Treasury Bonds Dashboard (Dribbble #19815063)

## Overview

Full-app dark slate redesign. Terminal/financial aesthetic — dark slate base, off-white text, green/red for sentiment, monospace for handles and numbers. CSS variable override approach: replace `:root` tokens in `globals.css`, components inherit automatically. Targeted overrides for sentiment accents and card chrome.

## Decisions

| Decision | Choice |
|----------|--------|
| Scope | Full app (dashboard, drill-down, settings, nav, login) |
| Charts | No — text/data focused cards |
| Card density | Keep current 3-col grid |
| Base color | Dark slate (not pure black) |
| Sentiment colors | Green/red/amber/slate |
| Approach | CSS variable override in globals.css |
| Font | Inter (body) + JetBrains Mono (handles, numbers, tickers) |

---

## Color Palette

Override `:root` in `globals.css` (eliminate light/dark split — lock to dark):

| Token | Value | Use |
|-------|-------|-----|
| `--background` | `oklch(0.13 0.01 240)` | Page background |
| `--card` | `oklch(0.17 0.01 240)` | Card surfaces |
| `--foreground` | `oklch(0.95 0 0)` | Primary text (off-white) |
| `--muted-foreground` | `oklch(0.55 0.01 240)` | Secondary text |
| `--border` | `oklch(0.25 0.01 240)` | Card/input borders |
| `--primary` | `oklch(0.95 0 0)` | Primary actions |
| `--primary-foreground` | `oklch(0.13 0.01 240)` | Text on primary buttons |
| `--muted` | `oklch(0.20 0.01 240)` | Muted backgrounds |
| `--input` | `oklch(0.22 0.01 240)` | Input fields |
| `--accent` | `oklch(0.22 0.01 240)` | Hover/accent bg |
| `--accent-foreground` | `oklch(0.95 0 0)` | Text on accent |
| `--secondary` | `oklch(0.20 0.01 240)` | Secondary surfaces |
| `--secondary-foreground` | `oklch(0.95 0 0)` | Text on secondary |
| `--popover` | `oklch(0.17 0.01 240)` | Popover/dropdown bg |
| `--popover-foreground` | `oklch(0.95 0 0)` | Popover text |
| `--ring` | `oklch(0.55 0.01 240)` | Focus rings |

**Sentiment colors** (applied as Tailwind utilities, not tokens):
- Bullish: `text-green-400` / `bg-green-900/40`
- Bearish: `text-red-400` / `bg-red-900/40`
- Neutral: `text-slate-400` / `bg-slate-800/60`
- Mixed: `text-amber-400` / `bg-amber-900/40`

---

## Typography

**Fonts:**
- Body: `Inter` (replaces Geist Sans) — `next/font/google`
- Mono: `JetBrains_Mono` (replaces Geist Mono) — `next/font/google`

**Usage:**
- Handles (`@handle`): `font-mono text-sm`
- Ticker symbols + prices: `font-mono text-xs`
- Engagement counts, tweet times: `font-mono text-xs text-muted-foreground`
- Summaries: `text-sm leading-relaxed text-foreground/80`
- Nav wordmark: `font-mono text-sm tracking-widest uppercase`

---

## Navigation

**Before:** Nav bar (wordmark + links) + separate category filter row below page header.

**After:** Single unified dark nav bar:
- Left: "MARKET DIGEST" wordmark — `font-mono text-sm tracking-widest uppercase`
- Center: Category filter tabs inline (All · Traders · Crypto · Onchain · VC · TradFi · Thematic · Builders)
- Right: Date picker + Sign out
- Style: `bg-card border-b border-border` — no shadow
- Active filter: `text-foreground` with bottom border underline; inactive: `text-muted-foreground hover:text-foreground`

**Page header** (title + date shown separately) is removed — consolidated into nav.

---

## Account Cards

**Left-border sentiment accent:**
```
bullish  → border-l-4 border-l-green-500
bearish  → border-l-4 border-l-red-500
neutral  → border-l-4 border-l-slate-500
mixed    → border-l-4 border-l-amber-500
pending/no digest → no left border
```

**Card structure:**
- Container: `bg-card border border-border rounded-lg border-l-4 <sentiment-color>`
- Hover: `hover:bg-card/80` (brightness shift, no shadow)
- Handle: `font-mono text-sm text-foreground` → `@handle`
- Display name: `text-xs text-muted-foreground`
- Sentiment: small colored dot (`w-1.5 h-1.5 rounded-full`) + label text — not a pill badge
- Summary: `text-sm leading-relaxed text-foreground/80`
- Tickers: `font-mono text-xs`, existing TickerBadge coloring (green/red for change)
- Tweet count: `font-mono text-xs text-muted-foreground` bottom right

---

## Drill-down Page

- Same dark card surface throughout
- Key tweets: `border-l-2 border-l-green-500` (primary green accent) instead of `border-primary`
- Engagement stats (likes, retweets, time, X link): `font-mono text-xs text-muted-foreground`
- Ticker section: same TickerBadge components, inherit font-mono
- Back link: `text-muted-foreground hover:text-foreground`

---

## Settings / Accounts Page

- Table rows and input fields inherit dark tokens automatically
- Toggle switches use `primary` color (off-white) — fine as-is
- Category tags on account rows: `font-mono text-xs` badges
- No structural changes needed

---

## Login Page

- Dark centered card, same palette
- Input + button inherit theme tokens
- No structural changes

---

## Files to Change

| File | Change |
|------|--------|
| `app/globals.css` | Replace all `:root` and `.dark` token values with dark slate palette |
| `app/layout.tsx` | Swap Geist → Inter + JetBrains Mono imports |
| `components/nav.tsx` | Unified nav bar: wordmark + inline category filter + date + sign out |
| `app/dashboard/page.tsx` | Remove separate header/filter rows (now in nav) |
| `components/account-card.tsx` | Left-border accent, mono handle, dot sentiment, hover style |
| `components/category-filter.tsx` | Move into nav; tab-style active state |
| `app/dashboard/[handle]/page.tsx` | Mono engagement stats, green left-border for key tweets |
| `app/login/page.tsx` | Minor: inherit dark theme, no structural change |
