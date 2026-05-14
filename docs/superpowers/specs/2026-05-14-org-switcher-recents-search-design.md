# OrgSwitcher — Recents + Search

**Date:** 2026-05-14
**File:** `components/admin/OrgSwitcher.tsx` (only)

## What changes

Add two UX improvements to the org selector dropdown:
1. A "Recent" section at the top showing the last 5 orgs visited
2. A search input that filters the full alphabetical org list below

## Storage

New localStorage key: `pib_recent_orgs` (string[], max 5, most-recent-first).
- Updated on every `setOrg` call: prepend selected org ID → dedup → slice(0, 5)
- `clearOrg` does NOT clear recent history — recents are navigation history, not selection state
- Managed inside `OrgSwitcher` component only; no OrgContext changes

## Dropdown layout

```
┌──────────────────────────────┐
│  ⊞  All orgs                 │  always first, clears selection
├──────────────────────────────┤
│  RECENT                      │  label hidden until ≥1 history entry
│  [E] Echo                    │
│  [L] Lead Rescue             │
│  …up to 5                    │
├──────────────────────────────┤
│  🔍  Search orgs…            │  filters list below, live as-you-type
│  [A] AHS Law                 │
│  [C] Covalonic               │  max-h-48 overflow-y-auto
│  …                           │
└──────────────────────────────┘
```

## Behaviour details

- Search is case-insensitive substring match on `org.name`
- Search input clears when dropdown closes (`onBlur` / click-outside)
- Bottom list always shows all orgs (not deduplicated from recents) — user can click same org from either section
- Recent items use the same button/style as current org buttons
