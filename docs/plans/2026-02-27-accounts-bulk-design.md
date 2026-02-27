# Accounts Page Bulk Management Design

**Date:** 2026-02-27
**Project:** Twitter Indicators
**Status:** Approved

## Overview

Two features on the settings/accounts page:
1. Account tracker: total count displayed top-right
2. Multi-select with bulk operations: add/remove categories, delete

## Account Tracker

- `"Tracking: N accounts"` displayed top-right in the page header, next to the Add Account button
- N = count of all accounts in loaded state
- Font mono, muted, updates in real-time as accounts are added/deleted

## Multi-select

### Checkbox UI
- Always-visible checkbox as leftmost element on each row
- Select-all checkbox in header row
- Checks/unchecks all accounts in loaded state

### Bulk Action Bar
- Appears (sticky bottom of viewport) when ≥1 account selected
- Disappears / resets when ✕ is clicked or selection clears
- Content: `{N} selected | [Add category ▾] | [Remove category ▾] | [Delete] | [✕]`

### Category Popovers
- "Add category" and "Remove category" each open a small popover
- Popover contains 7 checkboxes (one per category)
- "Apply" button fires the bulk API call
- Only one popover open at a time

### Delete Flow
- On click: inline confirmation replaces Delete button text: "Delete {N} accounts and all their data? [Confirm] [Cancel]"
- On confirm: fires bulk API, removes from local state, clears selection

## API

New endpoint: `POST /api/accounts/bulk`

```json
// Delete
{ "ids": ["id1", "id2"], "action": "delete" }

// Add categories (non-destructive, uses Prisma push)
{ "ids": ["id1", "id2"], "action": "add-categories", "categories": ["crypto", "traders"] }

// Remove categories
{ "ids": ["id1", "id2"], "action": "remove-categories", "categories": ["vc"] }
```

Auth: same cookie-based pattern as existing account routes.

Prisma operations:
- delete: `deleteMany({ where: { id: { in: ids } } })`
- add-categories: `updateMany` not sufficient for array operations — use `$transaction` with per-record `update` pushing new categories (dedup with Set)
- remove-categories: same — `$transaction` with per-record `update` filtering out removed categories

## Files

- Modify: `app/settings/accounts/page.tsx` — checkboxes, selection state, bulk action bar, category popovers, tracker count
- Create: `app/api/accounts/bulk/route.ts` — bulk endpoint
