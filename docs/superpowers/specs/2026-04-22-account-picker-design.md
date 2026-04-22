# Social Account Picker — Design Spec
**Date:** 2026-04-22
**Status:** Approved

---

## Problem

When a user connects Facebook or LinkedIn via OAuth, the system auto-picks the first page found and ignores personal profiles and other pages. Users have no way to choose which account(s) to connect, and agents have no way to know which sub-account to post to.

---

## Goals

1. Let users select multiple sub-accounts (personal + pages) after connecting Facebook or LinkedIn
2. Mark one as the default for agent auto-posting
3. Show one grouped card per platform on the accounts page
4. Show each sub-account as a separate selectable option on the compose page
5. Update agent skills so Pip/Hermes know how to target specific sub-accounts

---

## Out of Scope

- Account picker for X, Bluesky, Reddit, TikTok, Pinterest, Threads, YouTube, Mastodon (single-account platforms — unchanged)
- Switching default mid-session without going to the accounts page
- Automatic sub-account discovery without re-running OAuth

---

## Flow

```
User clicks "Connect LinkedIn"
  → OAuth → LinkedIn → callback
  → Callback fetches: personal profile + all org pages
  → Writes social_oauth_pending/{nonce} with all options + encrypted tokens
  → Redirects to /admin/social/accounts?picker={nonce}

Accounts page loads
  → Detects ?picker=nonce in URL
  → Fetches GET /api/v1/social/oauth/pending/{nonce}
  → Shows picker modal over the page
  → User checks/unchecks sub-accounts (multi-select)
  → User clicks one checked item to mark as ★ default
  → Clicks "Connect selected (N)"
  → POST /api/v1/social/accounts/confirm {nonce, selections}
  → One social_accounts doc created per selection
  → Modal closes, accounts list refreshes
```

If user clicks "Skip" or closes modal → pending doc is not consumed (expires in 30 min).

---

## Data Model

### `social_accounts` — new fields

| Field | Type | Description |
|---|---|---|
| `isDefault` | `boolean` | Agent uses this sub-account unless `accountIds` is specified |
| `subAccountType` | `'personal' \| 'page'` | Shown as badge in UI |
| `parentPlatformAccountId` | `string?` | OAuth user ID that produced these sub-accounts (links siblings) |

All existing fields unchanged. Each sub-account is its own doc — no structural change to how account-resolver works.

### `social_oauth_pending/{nonce}` — new collection

```ts
{
  nonce: string
  orgId: string
  platform: 'facebook' | 'linkedin'
  createdAt: Timestamp
  expiresAt: Timestamp          // 30 minutes from creation
  options: Array<{
    index: number
    displayName: string
    username: string
    avatarUrl: string
    profileUrl: string
    accountType: 'personal' | 'page'
    platformAccountId: string
    encryptedTokens: EncryptedTokenBlock
    platformMeta: Record<string, unknown>
  }>
}
```

---

## API Endpoints

### `GET /api/v1/social/oauth/pending/[nonce]`
- Auth: `withAuth('client')`
- Validates nonce belongs to caller's orgId
- Returns options array (no tokens exposed)
- Returns 404 if expired or already consumed

### `POST /api/v1/social/accounts/confirm`
- Auth: `withAuth('client')`
- Body: `{ nonce: string, selections: Array<{ index: number, isDefault: boolean }> }`
- Validates nonce → creates one `social_accounts` doc per selection
- Ensures exactly one `isDefault: true` per platform per org (unsets previous default)
- Deletes the pending doc on success
- Returns: `{ accountIds: string[] }`

### `PUT /api/v1/social/accounts/[id]/set-default`
- Auth: `withAuth('client')`
- Sets `isDefault: true` on this doc, `false` on all other docs for same platform + org
- Used when user clicks ★ on an existing connected account
- Query param: `?orgId=` (admin role)

---

## OAuth Callback Changes

**Facebook only:**
- After token exchange, always fetch pages + personal profile
- If result has ≥1 option → write to `social_oauth_pending`, redirect with `?picker=nonce`
- Remove the current auto-pick-first-page logic

**LinkedIn only:**
- After token exchange, always fetch personal profile + all org pages
- Always → write to `social_oauth_pending`, redirect with `?picker=nonce`
- Even if user has no org pages — picker still shows (just personal profile)
- Remove the current auto-pick-first-org logic

**All other platforms:** No change.

---

## Account-Resolver Changes

`findDefaultAccount` updated to prefer `isDefault === true`:

```ts
// 1. Try isDefault=true + active
const defaultSnap = await adminDb.collection('social_accounts')
  .where('orgId', '==', orgId)
  .where('platform', '==', platform)
  .where('status', '==', 'active')
  .where('isDefault', '==', true)
  .limit(1).get()

if (!defaultSnap.empty) return { id, data }

// 2. Fall back to any active account (existing behaviour)
```

No other resolver changes needed.

---

## Accounts Page UI Changes

### Grouping
- Fetch all non-disconnected accounts
- Group by `platform`
- Render one card per platform (not one card per account)

### Platform card structure
```
[Platform icon] LinkedIn          2 accounts · [+ Add account]
──────────────────────────────────────────────────────────────
[avatar] Peet Stander             PERSONAL   active    Disconnect
[avatar] Partners in Biz         PAGE    ★ default     Disconnect
```

### Picker modal
- Shown when `?picker=nonce` is in URL params
- Fetches options from `GET /api/v1/social/oauth/pending/[nonce]`
- Multi-select checkboxes
- Clicking a checked item sets it as ★ default (exactly one default per submit)
- "Connect selected (N)" button — disabled if nothing selected
- "Skip" button — dismisses modal, clears query param

### Set default on existing accounts
- Clicking the ★ badge on a connected account calls `PUT /accounts/[id]/set-default`
- Updates UI optimistically

---

## Compose Page (No change needed)

Each `social_accounts` doc already shows as a separate selectable destination. The compose page already references accounts by `accountId`. No changes required — sub-accounts just appear as separate entries automatically.

---

## Skill Updates (`social-media-manager` SKILL.md)

Add a new section **"Multi-account platforms (Facebook & LinkedIn)"**:

- Explain personal vs page sub-account types
- Document that each sub-account has its own `accountId`
- Default resolution: agent uses `isDefault=true` account unless `accountIds` is specified
- How to list sub-accounts: `GET /api/v1/social/accounts?platform=linkedin`
- How to target a specific sub-account: include `accountIds: ["<id>"]` on the post
- Which platforms support multiple sub-accounts: Facebook, LinkedIn only

---

## Implementation Order

1. `social_oauth_pending` Firestore collection + TTL (no UI yet)
2. OAuth callback refactor (Facebook + LinkedIn) → write pending, redirect with nonce
3. `GET /pending/[nonce]` + `POST /accounts/confirm` endpoints
4. `PUT /accounts/[id]/set-default` endpoint + account-resolver update
5. Accounts page — grouped card UI + picker modal
6. Skill update

---

## Migration

Existing `social_accounts` docs will not have `isDefault` or `subAccountType`. The resolver fallback (any active account) handles this gracefully — existing posts and scheduled content continue working unchanged. No migration script needed.
