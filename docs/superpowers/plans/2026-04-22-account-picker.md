# Social Account Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After Facebook/LinkedIn OAuth, let users pick which sub-accounts (personal + pages) to connect, set a default for agents, and show grouped platform cards on the accounts page.

**Architecture:** OAuth callback writes available options to a `social_oauth_pending` Firestore doc and redirects with `?picker=nonce`. The accounts page detects the nonce, shows a modal, and on confirm calls `POST /accounts/confirm` which creates one `social_accounts` doc per selection. Each doc gets `isDefault` and `subAccountType` fields. The accounts page groups docs by platform into cards. The account-resolver prefers `isDefault=true` docs.

**Tech Stack:** Next.js App Router, Firebase Admin SDK, TypeScript, react-icons, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-04-22-account-picker-design.md`

---

## File Map

| Action | Path | Purpose |
|---|---|---|
| Modify | `app/api/v1/social/oauth/[platform]/callback/route.ts` | Write pending doc + redirect with nonce for Facebook/LinkedIn |
| Create | `app/api/v1/social/oauth/pending/[nonce]/route.ts` | GET — fetch picker options |
| Create | `app/api/v1/social/accounts/confirm/route.ts` | POST — save selected sub-accounts |
| Create | `app/api/v1/social/accounts/[id]/set-default/route.ts` | PUT — flip isDefault flag |
| Modify | `lib/social/account-resolver.ts` | Prefer isDefault=true in findDefaultAccount |
| Modify | `app/(admin)/admin/social/accounts/page.tsx` | Grouped platform cards + picker modal |
| Modify | `.claude/skills/social-media-manager/SKILL.md` | Document multi-account platforms |
| Create | `__tests__/api/social/pending.test.ts` | Tests for pending + confirm + set-default |
| Create | `__tests__/lib/social/account-resolver-default.test.ts` | Tests for updated findDefaultAccount |

---

## Task 1: OAuth callback — write pending doc for Facebook + LinkedIn

**Files:**
- Modify: `app/api/v1/social/oauth/[platform]/callback/route.ts`

The existing callback auto-picks the first page for Facebook and the first org for LinkedIn. Replace both blocks with logic that builds an options array and writes a `social_oauth_pending` doc, then redirects with `?picker=nonce`.

- [ ] **Step 1: Add pending-write helper at the bottom of the callback file**

After the `exchangeThreadsLongLivedToken` function, add:

```ts
async function writePendingAndRedirect(
  options: Array<{
    index: number
    displayName: string
    username: string
    avatarUrl: string
    profileUrl: string
    accountType: 'personal' | 'page'
    platformAccountId: string
    encryptedTokens: {
      accessToken: string
      refreshToken: string | null
      tokenType: string
      expiresAt: Date | null
      iv: string
      tag: string
    }
    platformMeta: Record<string, unknown>
    scopes: string[]
  }>,
  platform: string,
  orgId: string,
  nonce: string,
  redirectUrl: string,
  originUrl: string,
): Promise<NextResponse> {
  const expiresAt = Timestamp.fromDate(new Date(Date.now() + 30 * 60 * 1000))
  const pendingData = {
    nonce,
    orgId,
    platform,
    createdAt: Timestamp.now(),
    expiresAt,
    options: options.map(opt => ({
      ...opt,
      encryptedTokens: {
        ...opt.encryptedTokens,
        expiresAt: opt.encryptedTokens.expiresAt
          ? Timestamp.fromDate(opt.encryptedTokens.expiresAt)
          : null,
      },
    })),
  }
  await adminDb.collection('social_oauth_pending').doc(nonce).set(pendingData)
  const url = new URL(redirectUrl, originUrl)
  url.searchParams.set('picker', nonce)
  url.searchParams.set('platform', platform)
  return NextResponse.redirect(url.toString())
}
```

- [ ] **Step 2: Replace the Facebook profile block in the callback**

Find the existing block:
```ts
if (platform === 'facebook') {
  profile = await fetchFacebookPageProfile(tokenResponse.accessToken)
  providerCreds.accessToken = profile.pageAccessToken ?? tokenResponse.accessToken
}
```

Replace the entire `// Fetch profile from platform` section **and** the `// Encrypt tokens` + `// Check if account already exists` + `// Create new account` + `// Audit log` + `return NextResponse.redirect(...)` blocks for Facebook with:

```ts
if (platform === 'facebook') {
  const fbResult = await fetchAllFacebookAccounts(tokenResponse.accessToken)
  const options = fbResult.map((acc, i) => {
    const encrypted = encryptTokenBlock(
      {
        accessToken: acc.accessToken,
        refreshToken: null,
        tokenType: 'Bearer',
        expiresAt: null,
      },
      orgId,
    )
    return {
      index: i,
      displayName: acc.displayName,
      username: acc.username,
      avatarUrl: acc.avatarUrl,
      profileUrl: acc.profileUrl,
      accountType: acc.accountType,
      platformAccountId: acc.platformAccountId,
      encryptedTokens: encrypted,
      platformMeta: acc.meta ?? {},
      scopes: config.scopes,
    }
  })
  return writePendingAndRedirect(options, platform, orgId, nonce, redirectUrl, url.origin)
}
```

- [ ] **Step 3: Replace the LinkedIn profile block**

Find:
```ts
} else if (platform === 'linkedin') {
  const linkedInProfile = await fetchLinkedInProfile(tokenResponse.accessToken)
  providerCreds.personUrn = linkedInProfile.personUrn
  profile = linkedInProfile
}
```

Replace the same scope of code (profile fetch + encrypt + save + redirect) for LinkedIn:

```ts
if (platform === 'linkedin') {
  const liResult = await fetchAllLinkedInAccounts(tokenResponse.accessToken)
  const refreshToken = tokenResponse.refreshToken ?? null
  const expiresAt = tokenResponse.expiresIn
    ? new Date(Date.now() + tokenResponse.expiresIn * 1000)
    : null
  const options = liResult.map((acc, i) => {
    const encrypted = encryptTokenBlock(
      { accessToken: tokenResponse.accessToken, refreshToken, expiresAt },
      orgId,
    )
    return {
      index: i,
      displayName: acc.displayName,
      username: acc.username,
      avatarUrl: acc.avatarUrl,
      profileUrl: acc.profileUrl,
      accountType: acc.accountType,
      platformAccountId: acc.platformAccountId,
      encryptedTokens: encrypted,
      platformMeta: acc.meta ?? {},
      scopes: config.scopes,
    }
  })
  return writePendingAndRedirect(options, platform, orgId, nonce, redirectUrl, url.origin)
}
```

- [ ] **Step 4: Replace `fetchFacebookPageProfile` with `fetchAllFacebookAccounts`**

Delete the existing `fetchFacebookPageProfile` function and replace with:

```ts
interface FacebookAccount {
  platformAccountId: string
  displayName: string
  username: string
  avatarUrl: string
  profileUrl: string
  accountType: 'personal' | 'page'
  accessToken: string
  meta: Record<string, unknown>
}

async function fetchAllFacebookAccounts(userAccessToken: string): Promise<FacebookAccount[]> {
  const accounts: FacebookAccount[] = []

  // Personal profile
  const meRes = await fetch(
    `https://graph.facebook.com/v19.0/me?fields=id,name,picture&access_token=${userAccessToken}`,
  )
  if (meRes.ok) {
    const me = await meRes.json() as { id: string; name: string; picture?: { data?: { url?: string } } }
    accounts.push({
      platformAccountId: me.id,
      displayName: me.name,
      username: me.name,
      avatarUrl: me.picture?.data?.url ?? '',
      profileUrl: `https://www.facebook.com/${me.id}`,
      accountType: 'personal',
      accessToken: userAccessToken,
      meta: {},
    })
  }

  // Pages
  const pagesRes = await fetch(
    `https://graph.facebook.com/v19.0/me/accounts?fields=id,name,category,access_token,picture&access_token=${userAccessToken}`,
  )
  if (pagesRes.ok) {
    const pagesData = await pagesRes.json() as {
      data: Array<{ id: string; name: string; category?: string; access_token: string; picture?: { data?: { url?: string } } }>
    }
    for (const page of pagesData.data ?? []) {
      accounts.push({
        platformAccountId: page.id,
        displayName: page.name,
        username: page.name,
        avatarUrl: page.picture?.data?.url ?? '',
        profileUrl: `https://www.facebook.com/${page.id}`,
        accountType: 'page',
        accessToken: page.access_token,
        meta: { pageCategory: page.category },
      })
    }
  }

  return accounts
}
```

- [ ] **Step 5: Replace `fetchLinkedInProfile` with `fetchAllLinkedInAccounts`**

Delete the existing `fetchLinkedInProfile` function and replace with:

```ts
interface LinkedInAccount {
  platformAccountId: string
  displayName: string
  username: string
  avatarUrl: string
  profileUrl: string
  accountType: 'personal' | 'page'
  meta: Record<string, unknown>
}

async function fetchAllLinkedInAccounts(accessToken: string): Promise<LinkedInAccount[]> {
  const accounts: LinkedInAccount[] = []
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'X-Restli-Protocol-Version': '2.0.0',
    'LinkedIn-Version': '202502',
  }

  // Personal profile
  const userRes = await fetch('https://api.linkedin.com/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  let personalUrn = ''
  if (userRes.ok) {
    const user = await userRes.json() as { sub: string; name: string; picture?: string; email?: string }
    personalUrn = `urn:li:person:${user.sub}`
    accounts.push({
      platformAccountId: personalUrn,
      displayName: user.name,
      username: user.email ?? user.sub,
      avatarUrl: user.picture ?? '',
      profileUrl: `https://www.linkedin.com/in/${user.sub}`,
      accountType: 'personal',
      meta: { personUrn: personalUrn, personalEmail: user.email ?? null },
    })
  }

  // Org pages
  try {
    const orgAclsRes = await fetch(
      'https://api.linkedin.com/v2/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&count=10',
      { headers },
    )
    if (orgAclsRes.ok) {
      const orgAcls = await orgAclsRes.json() as {
        elements?: Array<{ organization: string; role: string; state: string }>
      }
      const approvedOrgs = orgAcls.elements?.filter(e => e.state === 'APPROVED') ?? []
      for (const org of approvedOrgs) {
        const orgUrn = org.organization
        const orgNumId = orgUrn.split(':').pop()!
        try {
          const orgRes = await fetch(
            `https://api.linkedin.com/v2/organizations/${orgNumId}?projection=(id,localizedName,vanityName)`,
            { headers },
          )
          if (orgRes.ok) {
            const orgData = await orgRes.json() as { id: number; localizedName: string; vanityName?: string }
            const vanityName = orgData.vanityName ?? String(orgData.id)
            accounts.push({
              platformAccountId: orgUrn,
              displayName: orgData.localizedName,
              username: vanityName,
              avatarUrl: '',
              profileUrl: `https://www.linkedin.com/company/${vanityName}`,
              accountType: 'page',
              meta: { personUrn: orgUrn, personalUrn },
            })
          }
        } catch { /* skip this org */ }
      }
    }
  } catch { /* org fetch failed, personal only */ }

  return accounts
}
```

- [ ] **Step 6: Verify the callback still handles other platforms unchanged**

The existing `try/catch` block that handles all other platforms (Twitter, Instagram, Threads, Reddit, TikTok, Pinterest, YouTube, Mastodon) must remain intact. The Facebook and LinkedIn branches now return early via `writePendingAndRedirect`, so the rest of the function only runs for other platforms.

- [ ] **Step 7: Build and check for type errors**

```bash
cd "partnersinbiz-web" && npx tsc --noEmit 2>&1 | head -30
```

Expected: no output (no errors).

- [ ] **Step 8: Commit**

```bash
git add app/api/v1/social/oauth/[platform]/callback/route.ts
git commit -m "feat: write social_oauth_pending for Facebook/LinkedIn OAuth, redirect with picker nonce"
```

---

## Task 2: GET /api/v1/social/oauth/pending/[nonce]

**Files:**
- Create: `app/api/v1/social/oauth/pending/[nonce]/route.ts`
- Create: `__tests__/api/social/pending.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/api/social/pending.test.ts`:

```ts
const mockGet = jest.fn()
const mockCollection = jest.fn(() => ({ doc: jest.fn(() => ({ get: mockGet })) }))

jest.mock('@/lib/firebase/admin', () => ({ adminDb: { collection: mockCollection } }))
jest.mock('@/lib/api/auth', () => ({
  withAuth: (_role: string, handler: any) => handler,
}))
jest.mock('@/lib/api/tenant', () => ({
  withTenant: (handler: any) => (req: any, user: any, ctx: any) => handler(req, user, 'org-1', ctx),
}))
jest.mock('@/lib/api/response', () => ({
  apiSuccess: (data: any) => ({ json: () => ({ data }), status: 200 }),
  apiError: (msg: string, code = 400) => ({ json: () => ({ error: msg }), status: code }),
}))

import { GET } from '@/app/api/v1/social/oauth/pending/[nonce]/route'

function makeReq(nonce: string) {
  return { url: `http://localhost/api/v1/social/oauth/pending/${nonce}` } as any
}

describe('GET /api/v1/social/oauth/pending/[nonce]', () => {
  it('returns 404 when doc does not exist', async () => {
    mockGet.mockResolvedValue({ exists: false })
    const res = await GET(makeReq('abc'), { params: Promise.resolve({ nonce: 'abc' }) } as any)
    expect(res.status).toBe(404)
  })

  it('returns 404 when orgId does not match', async () => {
    mockGet.mockResolvedValue({
      exists: true,
      data: () => ({
        orgId: 'other-org',
        expiresAt: { toDate: () => new Date(Date.now() + 60000) },
        platform: 'linkedin',
        options: [],
      }),
    })
    const res = await GET(makeReq('abc'), { params: Promise.resolve({ nonce: 'abc' }) } as any)
    expect(res.status).toBe(404)
  })

  it('returns 404 when expired', async () => {
    mockGet.mockResolvedValue({
      exists: true,
      data: () => ({
        orgId: 'org-1',
        expiresAt: { toDate: () => new Date(Date.now() - 1000) },
        platform: 'linkedin',
        options: [],
      }),
    })
    const res = await GET(makeReq('abc'), { params: Promise.resolve({ nonce: 'abc' }) } as any)
    expect(res.status).toBe(404)
  })

  it('returns options without encryptedTokens', async () => {
    mockGet.mockResolvedValue({
      exists: true,
      data: () => ({
        orgId: 'org-1',
        expiresAt: { toDate: () => new Date(Date.now() + 60000) },
        platform: 'linkedin',
        options: [
          { index: 0, displayName: 'Peet', accountType: 'personal', encryptedTokens: { accessToken: 'secret' } },
        ],
      }),
    })
    const res = await GET(makeReq('abc'), { params: Promise.resolve({ nonce: 'abc' }) } as any)
    expect(res.status).toBe(200)
    const body = res.json()
    expect(body.data.options[0].encryptedTokens).toBeUndefined()
    expect(body.data.options[0].displayName).toBe('Peet')
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd partnersinbiz-web && npx jest __tests__/api/social/pending.test.ts --no-coverage 2>&1 | tail -10
```

Expected: FAIL — `Cannot find module '@/app/api/v1/social/oauth/pending/[nonce]/route'`

- [ ] **Step 3: Create the route**

Create `app/api/v1/social/oauth/pending/[nonce]/route.ts`:

```ts
import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { withTenant } from '@/lib/api/tenant'
import { apiSuccess, apiError } from '@/lib/api/response'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ nonce: string }> }

export const GET = withAuth('client', withTenant(async (_req: NextRequest, _user, orgId, context) => {
  const { nonce } = await (context as Params).params
  const doc = await adminDb.collection('social_oauth_pending').doc(nonce).get()

  if (!doc.exists) return apiError('Not found', 404)

  const data = doc.data()!
  if (data.orgId !== orgId) return apiError('Not found', 404)
  if (data.expiresAt.toDate() < new Date()) return apiError('Not found', 404)

  // Strip encrypted tokens before returning to client
  const options = (data.options as any[]).map(({ encryptedTokens: _, ...opt }) => opt)

  return apiSuccess({ platform: data.platform, options })
}))
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
cd partnersinbiz-web && npx jest __tests__/api/social/pending.test.ts --no-coverage 2>&1 | tail -10
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add app/api/v1/social/oauth/pending/[nonce]/route.ts __tests__/api/social/pending.test.ts
git commit -m "feat: GET /api/v1/social/oauth/pending/[nonce] — return picker options"
```

---

## Task 3: POST /api/v1/social/accounts/confirm

**Files:**
- Create: `app/api/v1/social/accounts/confirm/route.ts`
- Modify: `__tests__/api/social/pending.test.ts` (add confirm tests)

- [ ] **Step 1: Add confirm tests to the existing test file**

Append to `__tests__/api/social/pending.test.ts`:

```ts
// --- confirm tests ---
const mockBatch = {
  update: jest.fn(),
  set: jest.fn(),
  delete: jest.fn(),
  commit: jest.fn().mockResolvedValue(undefined),
}
const mockBatchFn = jest.fn(() => mockBatch)
const mockWhere = jest.fn()
const mockLimit = jest.fn()
const mockGetQuery = jest.fn()

// Override adminDb for confirm tests
jest.mock('@/app/api/v1/social/accounts/confirm/route', () => {
  // Let actual module load — mocks set above cover firebase
  return jest.requireActual('@/app/api/v1/social/accounts/confirm/route')
}, { virtual: false })

import { POST } from '@/app/api/v1/social/accounts/confirm/route'

describe('POST /api/v1/social/accounts/confirm', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // pending doc
    mockGet.mockResolvedValue({
      exists: true,
      ref: { id: 'nonce-1' },
      data: () => ({
        orgId: 'org-1',
        platform: 'linkedin',
        expiresAt: { toDate: () => new Date(Date.now() + 60000) },
        options: [
          {
            index: 0,
            displayName: 'Peet',
            username: 'peet@test.com',
            avatarUrl: '',
            profileUrl: '',
            accountType: 'personal',
            platformAccountId: 'urn:li:person:abc',
            encryptedTokens: { accessToken: 'enc', refreshToken: null, tokenType: 'Bearer', expiresAt: null, iv: 'iv', tag: 'tag' },
            platformMeta: {},
            scopes: ['openid'],
          },
        ],
      }),
    })
    // no existing defaults
    mockGetQuery.mockResolvedValue({ docs: [] })
    // no existing account
    const chainable = { where: mockWhere, limit: mockLimit, get: mockGetQuery }
    mockWhere.mockReturnValue(chainable)
    mockLimit.mockReturnValue(chainable)
    mockCollection.mockReturnValue({
      doc: jest.fn(() => ({ get: mockGet, ref: { id: 'new-id' } })),
      where: mockWhere,
      batch: mockBatchFn,
    })
    ;(adminDb as any).batch = mockBatchFn
  })

  it('returns 404 for unknown nonce', async () => {
    mockGet.mockResolvedValue({ exists: false })
    const req = { json: async () => ({ nonce: 'bad', selections: [] }) } as any
    const res = await POST(req, undefined as any)
    expect(res.status).toBe(404)
  })

  it('returns 400 when more than one isDefault', async () => {
    const req = {
      json: async () => ({
        nonce: 'nonce-1',
        selections: [
          { index: 0, isDefault: true },
          { index: 0, isDefault: true },
        ],
      }),
    } as any
    const res = await POST(req, undefined as any)
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Run tests to confirm new ones fail**

```bash
cd partnersinbiz-web && npx jest __tests__/api/social/pending.test.ts --no-coverage 2>&1 | tail -15
```

Expected: the two new confirm tests FAIL — `Cannot find module '@/app/api/v1/social/accounts/confirm/route'`

- [ ] **Step 3: Create the confirm route**

Create `app/api/v1/social/accounts/confirm/route.ts`:

```ts
import { NextRequest } from 'next/server'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { withTenant } from '@/lib/api/tenant'
import { apiSuccess, apiError } from '@/lib/api/response'

export const dynamic = 'force-dynamic'

export const POST = withAuth('client', withTenant(async (req: NextRequest, user, orgId) => {
  const body = await req.json()
  const { nonce, selections } = body as {
    nonce: string
    selections: Array<{ index: number; isDefault: boolean }>
  }

  if (!nonce || !Array.isArray(selections) || selections.length === 0) {
    return apiError('nonce and selections are required', 400)
  }

  const defaultCount = selections.filter(s => s.isDefault).length
  if (defaultCount > 1) return apiError('Only one default allowed per platform', 400)

  const pendingDoc = await adminDb.collection('social_oauth_pending').doc(nonce).get()
  if (!pendingDoc.exists) return apiError('Pending selection not found or expired', 404)

  const pending = pendingDoc.data()!
  if (pending.orgId !== orgId) return apiError('Not found', 404)
  if (pending.expiresAt.toDate() < new Date()) return apiError('Pending selection expired', 410)

  const platform: string = pending.platform
  const options: any[] = pending.options

  const batch = adminDb.batch()

  // Clear previous isDefault for this platform
  const existingDefaults = await adminDb
    .collection('social_accounts')
    .where('orgId', '==', orgId)
    .where('platform', '==', platform)
    .where('isDefault', '==', true)
    .get()

  for (const d of existingDefaults.docs) {
    batch.update(d.ref, { isDefault: false, updatedAt: FieldValue.serverTimestamp() })
  }

  const accountIds: string[] = []

  for (const sel of selections) {
    const option = options[sel.index]
    if (!option) continue

    // Restore Timestamp if expiresAt was serialised
    const encryptedTokens = {
      ...option.encryptedTokens,
      expiresAt: option.encryptedTokens.expiresAt
        ? (option.encryptedTokens.expiresAt instanceof Date
            ? Timestamp.fromDate(option.encryptedTokens.expiresAt)
            : option.encryptedTokens.expiresAt)
        : null,
    }

    // Upsert by platformAccountId
    const existing = await adminDb
      .collection('social_accounts')
      .where('orgId', '==', orgId)
      .where('platform', '==', platform)
      .where('platformAccountId', '==', option.platformAccountId)
      .limit(1)
      .get()

    const accountData = {
      orgId,
      platform,
      platformAccountId: option.platformAccountId,
      displayName: option.displayName,
      username: option.username,
      avatarUrl: option.avatarUrl,
      profileUrl: option.profileUrl,
      accountType: option.accountType,
      subAccountType: option.accountType as 'personal' | 'page',
      isDefault: sel.isDefault ?? false,
      status: 'active',
      scopes: option.scopes ?? [],
      encryptedTokens,
      platformMeta: option.platformMeta ?? {},
      updatedAt: FieldValue.serverTimestamp(),
    }

    if (!existing.empty) {
      const ref = existing.docs[0].ref
      batch.update(ref, accountData)
      accountIds.push(existing.docs[0].id)
    } else {
      const ref = adminDb.collection('social_accounts').doc()
      batch.set(ref, {
        ...accountData,
        connectedBy: user.uid,
        connectedAt: FieldValue.serverTimestamp(),
        lastTokenRefresh: null,
        lastUsed: null,
        createdAt: FieldValue.serverTimestamp(),
      })
      accountIds.push(ref.id)
    }
  }

  batch.delete(pendingDoc.ref)
  await batch.commit()

  return apiSuccess({ accountIds }, 201)
}))
```

- [ ] **Step 4: Run all tests**

```bash
cd partnersinbiz-web && npx jest __tests__/api/social/pending.test.ts --no-coverage 2>&1 | tail -15
```

Expected: all 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/v1/social/accounts/confirm/route.ts __tests__/api/social/pending.test.ts
git commit -m "feat: POST /api/v1/social/accounts/confirm — save selected sub-accounts"
```

---

## Task 4: PUT /api/v1/social/accounts/[id]/set-default + resolver update

**Files:**
- Create: `app/api/v1/social/accounts/[id]/set-default/route.ts`
- Modify: `lib/social/account-resolver.ts`
- Create: `__tests__/lib/social/account-resolver-default.test.ts`

- [ ] **Step 1: Write resolver tests**

Create `__tests__/lib/social/account-resolver-default.test.ts`:

```ts
const mockDefaultSnap = { empty: true, docs: [] }
const mockFallbackSnap = { empty: false, docs: [
  { id: 'acc-2', data: () => ({ platform: 'linkedin', orgId: 'org-1', status: 'active', isDefault: false }) }
] }

const mockGet = jest.fn()
const mockWhere = jest.fn()
const mockLimit = jest.fn()

const chain = { where: mockWhere, limit: mockLimit, get: mockGet }
mockWhere.mockReturnValue(chain)
mockLimit.mockReturnValue(chain)

jest.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: jest.fn(() => ({ where: mockWhere })) },
}))
jest.mock('@/lib/social/providers', () => ({
  getProvider: jest.fn(),
  getDefaultProvider: jest.fn(),
}))
jest.mock('@/lib/social/encryption', () => ({
  decryptTokenBlock: jest.fn(() => ({ accessToken: 'tok', refreshToken: null })),
}))

import { findDefaultAccount } from '@/lib/social/account-resolver'

describe('findDefaultAccount', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns isDefault=true account first when available', async () => {
    const defaultDoc = { id: 'acc-1', data: () => ({ platform: 'linkedin', isDefault: true, status: 'active' }) }
    mockGet
      .mockResolvedValueOnce({ empty: false, docs: [defaultDoc] }) // isDefault query
    const result = await findDefaultAccount('org-1', 'linkedin')
    expect(result?.id).toBe('acc-1')
  })

  it('falls back to any active account when no isDefault exists', async () => {
    mockGet
      .mockResolvedValueOnce({ empty: true, docs: [] }) // isDefault query returns nothing
      .mockResolvedValueOnce(mockFallbackSnap)           // fallback query
    const result = await findDefaultAccount('org-1', 'linkedin')
    expect(result?.id).toBe('acc-2')
  })

  it('returns null when no active accounts exist', async () => {
    mockGet
      .mockResolvedValueOnce({ empty: true, docs: [] })
      .mockResolvedValueOnce({ empty: true, docs: [] })
    const result = await findDefaultAccount('org-1', 'linkedin')
    expect(result).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd partnersinbiz-web && npx jest __tests__/lib/social/account-resolver-default.test.ts --no-coverage 2>&1 | tail -10
```

Expected: FAIL — tests fail because `findDefaultAccount` doesn't yet prefer `isDefault=true`.

- [ ] **Step 3: Update `findDefaultAccount` in `lib/social/account-resolver.ts`**

Replace the existing `findDefaultAccount` function body:

```ts
export async function findDefaultAccount(
  orgId: string,
  platformType: SocialPlatformType,
): Promise<{ id: string; data: FirebaseFirestore.DocumentData } | null> {
  const platformNames = platformMap[platformType]
  if (!platformNames) return null

  // 1. Prefer isDefault=true + active
  const defaultSnap = await adminDb
    .collection('social_accounts')
    .where('orgId', '==', orgId)
    .where('status', '==', 'active')
    .where('isDefault', '==', true)
    .get()

  for (const doc of defaultSnap.docs) {
    const data = doc.data()
    if (platformNames.includes(data.platform)) {
      return { id: doc.id, data }
    }
  }

  // 2. Fall back to any active account (handles accounts created before isDefault field existed)
  const fallbackSnap = await adminDb
    .collection('social_accounts')
    .where('orgId', '==', orgId)
    .where('status', '==', 'active')
    .get()

  for (const doc of fallbackSnap.docs) {
    const data = doc.data()
    if (platformNames.includes(data.platform)) {
      return { id: doc.id, data }
    }
  }

  return null
}
```

- [ ] **Step 4: Run resolver tests**

```bash
cd partnersinbiz-web && npx jest __tests__/lib/social/account-resolver-default.test.ts --no-coverage 2>&1 | tail -10
```

Expected: PASS (3 tests).

- [ ] **Step 5: Create the set-default route**

Create `app/api/v1/social/accounts/[id]/set-default/route.ts`:

```ts
import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { withTenant } from '@/lib/api/tenant'
import { apiSuccess, apiError } from '@/lib/api/response'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export const PUT = withAuth('client', withTenant(async (_req: NextRequest, _user, orgId, context) => {
  const { id } = await (context as Params).params

  const doc = await adminDb.collection('social_accounts').doc(id).get()
  if (!doc.exists) return apiError('Not found', 404)

  const data = doc.data()!
  if (data.orgId !== orgId) return apiError('Not found', 404)

  // Clear all existing defaults for this platform + org
  const existingDefaults = await adminDb
    .collection('social_accounts')
    .where('orgId', '==', orgId)
    .where('platform', '==', data.platform)
    .where('isDefault', '==', true)
    .get()

  const batch = adminDb.batch()
  for (const d of existingDefaults.docs) {
    if (d.id !== id) {
      batch.update(d.ref, { isDefault: false, updatedAt: FieldValue.serverTimestamp() })
    }
  }
  batch.update(doc.ref, { isDefault: true, updatedAt: FieldValue.serverTimestamp() })
  await batch.commit()

  return apiSuccess({ id })
}))
```

- [ ] **Step 6: Type-check**

```bash
cd partnersinbiz-web && npx tsc --noEmit 2>&1 | head -20
```

Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add lib/social/account-resolver.ts \
        app/api/v1/social/accounts/[id]/set-default/route.ts \
        __tests__/lib/social/account-resolver-default.test.ts
git commit -m "feat: isDefault-aware account resolver + PUT set-default endpoint"
```

---

## Task 5: Admin accounts page — grouped cards + picker modal

**Files:**
- Modify: `app/(admin)/admin/social/accounts/page.tsx`

This is a full rewrite of the page component. The new version:
1. Groups active accounts by platform into cards
2. Shows sub-account rows inside each platform card with PERSONAL/PAGE badge and ★ default badge
3. Detects `?picker=nonce` on load, fetches options, shows picker modal
4. Picker modal: multi-select checkboxes, one ★ default selection, "Connect selected" → POST confirm

- [ ] **Step 1: Replace the full page file**

Replace the entire contents of `app/(admin)/admin/social/accounts/page.tsx` with:

```tsx
'use client'
export const dynamic = 'force-dynamic'

import React, { useEffect, useState, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useOrg } from '@/lib/contexts/OrgContext'
import {
  FaXTwitter, FaLinkedin, FaFacebook, FaInstagram,
  FaReddit, FaTiktok, FaPinterest, FaYoutube,
} from 'react-icons/fa6'
import { SiThreads, SiBluesky } from 'react-icons/si'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type AccountStatus = 'active' | 'token_expired' | 'disconnected' | 'rate_limited'
type SubAccountType = 'personal' | 'page'

interface SocialAccount {
  id: string
  platform: string
  displayName: string
  username: string
  status: AccountStatus
  isDefault?: boolean
  subAccountType?: SubAccountType
  lastUsedAt: any
  tokenExpiresAt: any
  platformMeta?: Record<string, any>
}

interface PendingOption {
  index: number
  displayName: string
  username: string
  avatarUrl: string
  accountType: 'personal' | 'page'
  platformAccountId: string
  platformMeta?: Record<string, any>
}

/* ------------------------------------------------------------------ */
/*  Platform config                                                    */
/* ------------------------------------------------------------------ */

const PLATFORM_ICONS: Record<string, { color: string; icon: React.ReactNode }> = {
  twitter:   { color: 'bg-black',      icon: <FaXTwitter size={14} /> },
  linkedin:  { color: 'bg-blue-700',   icon: <FaLinkedin size={14} /> },
  facebook:  { color: 'bg-blue-600',   icon: <FaFacebook size={14} /> },
  instagram: { color: 'bg-pink-600',   icon: <FaInstagram size={14} /> },
  reddit:    { color: 'bg-orange-600', icon: <FaReddit size={14} /> },
  tiktok:    { color: 'bg-gray-800',   icon: <FaTiktok size={14} /> },
  pinterest: { color: 'bg-red-700',    icon: <FaPinterest size={14} /> },
  bluesky:   { color: 'bg-sky-500',    icon: <SiBluesky size={14} /> },
  threads:   { color: 'bg-gray-700',   icon: <SiThreads size={14} /> },
  youtube:   { color: 'bg-red-600',    icon: <FaYoutube size={14} /> },
}

const PLATFORM_LABELS: Record<string, string> = {
  twitter: 'X (Twitter)', linkedin: 'LinkedIn', facebook: 'Facebook',
  instagram: 'Instagram', reddit: 'Reddit', tiktok: 'TikTok',
  pinterest: 'Pinterest', bluesky: 'Bluesky', threads: 'Threads', youtube: 'YouTube',
}

const OAUTH_PLATFORMS = ['twitter','linkedin','facebook','instagram','reddit','tiktok','pinterest','threads','youtube']

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function tsToDate(ts: any): Date | null {
  if (!ts) return null
  if (ts._seconds) return new Date(ts._seconds * 1000)
  if (ts.seconds) return new Date(ts.seconds * 1000)
  return new Date(ts)
}

function daysUntil(ts: any): number | null {
  const d = tsToDate(ts)
  if (!d) return null
  return Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function PlatformBadge({ platformId }: { platformId: string }) {
  const cfg = PLATFORM_ICONS[platformId]
  if (!cfg) return <span className="bg-surface-container-high text-on-surface-variant text-[10px] px-2 py-0.5 rounded font-bold uppercase">{platformId.slice(0, 2)}</span>
  return <span className={`${cfg.color} text-white w-7 h-7 flex items-center justify-center rounded`}>{cfg.icon}</span>
}

function SubAccountRow({
  account,
  orgId,
  onDisconnect,
  onSetDefault,
  disconnecting,
}: {
  account: SocialAccount
  orgId: string
  onDisconnect: (id: string) => void
  onSetDefault: (id: string) => void
  disconnecting: boolean
}) {
  const days = daysUntil(account.tokenExpiresAt)

  return (
    <div className="flex items-center gap-3 px-4 py-3 border-t border-surface-container-high">
      <div className="w-8 h-8 rounded-full bg-surface-container-high flex items-center justify-center text-on-surface-variant text-xs font-semibold">
        {account.displayName.slice(0, 2).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-on-surface truncate">{account.displayName}</p>
        <p className="text-xs text-on-surface-variant truncate">@{account.username}</p>
        {days !== null && days <= 7 && (
          <p className={`text-[10px] ${days <= 0 ? 'text-red-400' : 'text-yellow-400'}`}>
            {days <= 0 ? 'Token expired' : `Expires in ${days}d`}
          </p>
        )}
      </div>
      {account.subAccountType && (
        <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${
          account.subAccountType === 'personal'
            ? 'bg-blue-900/30 text-blue-400'
            : 'bg-green-900/30 text-green-400'
        }`}>
          {account.subAccountType.toUpperCase()}
        </span>
      )}
      <button
        title={account.isDefault ? 'Default account for agents' : 'Set as default'}
        onClick={() => !account.isDefault && onSetDefault(account.id)}
        className={`text-[10px] px-2 py-0.5 rounded font-semibold transition-colors ${
          account.isDefault
            ? 'bg-indigo-900/40 text-indigo-300 cursor-default'
            : 'bg-surface-container-high text-on-surface-variant hover:bg-indigo-900/20 hover:text-indigo-300 cursor-pointer'
        }`}
      >
        {account.isDefault ? '★ default' : '☆'}
      </button>
      <button
        onClick={() => onDisconnect(account.id)}
        disabled={disconnecting}
        className="text-xs text-red-400 opacity-60 hover:opacity-100 transition-opacity disabled:opacity-30"
      >
        Disconnect
      </button>
    </div>
  )
}

function PlatformCard({
  platform,
  accounts,
  orgId,
  onDisconnect,
  onSetDefault,
  disconnectingId,
}: {
  platform: string
  accounts: SocialAccount[]
  orgId: string
  onDisconnect: (id: string) => void
  onSetDefault: (id: string) => void
  disconnectingId: string | null
}) {
  const label = PLATFORM_LABELS[platform] ?? platform
  const oauthUrl = `/api/v1/social/oauth/${platform}?redirectUrl=/admin/social/accounts${orgId ? `&orgId=${orgId}` : ''}`

  return (
    <div className="rounded-xl bg-surface-container overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <PlatformBadge platformId={platform} />
        <span className="text-sm font-semibold text-on-surface flex-1">{label}</span>
        <span className="text-xs text-on-surface-variant">{accounts.length} connected</span>
        {OAUTH_PLATFORMS.includes(platform) && (
          <a
            href={oauthUrl}
            className="text-xs text-on-surface-variant border border-surface-container-high rounded px-2 py-1 hover:bg-surface-container-high transition-colors"
          >
            + Add account
          </a>
        )}
      </div>
      {accounts.map(acc => (
        <SubAccountRow
          key={acc.id}
          account={acc}
          orgId={orgId}
          onDisconnect={onDisconnect}
          onSetDefault={onSetDefault}
          disconnecting={disconnectingId === acc.id}
        />
      ))}
    </div>
  )
}

function PickerModal({
  nonce,
  platform,
  orgId,
  onConfirm,
  onSkip,
}: {
  nonce: string
  platform: string
  orgId: string
  onConfirm: () => void
  onSkip: () => void
}) {
  const [options, setOptions] = useState<PendingOption[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [defaultIndex, setDefaultIndex] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const qs = orgId ? `?orgId=${orgId}` : ''
    fetch(`/api/v1/social/oauth/pending/${nonce}${qs}`)
      .then(r => r.json())
      .then(body => {
        setOptions(body.data?.options ?? [])
        // Pre-select all options, default to first
        const all = new Set((body.data?.options ?? []).map((_: any, i: number) => i))
        setSelected(all)
        setDefaultIndex(0)
      })
      .catch(() => setError('Failed to load account options.'))
      .finally(() => setLoading(false))
  }, [nonce, orgId])

  function toggleSelect(index: number) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
        if (defaultIndex === index) setDefaultIndex(null)
      } else {
        next.add(index)
      }
      return next
    })
  }

  function setAsDefault(index: number) {
    if (!selected.has(index)) return
    setDefaultIndex(index)
  }

  async function handleConfirm() {
    if (selected.size === 0) return
    setSaving(true)
    const qs = orgId ? `?orgId=${orgId}` : ''
    try {
      const selections = Array.from(selected).map(i => ({
        index: i,
        isDefault: i === defaultIndex,
      }))
      const res = await fetch(`/api/v1/social/accounts/confirm${qs}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nonce, selections }),
      })
      if (!res.ok) throw new Error(`Failed (${res.status})`)
      onConfirm()
    } catch {
      setError('Failed to save accounts. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const icfg = PLATFORM_ICONS[platform]
  const label = PLATFORM_LABELS[platform] ?? platform

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-surface-container rounded-2xl w-full max-w-md p-6 shadow-2xl">
        <div className="flex items-center gap-3 mb-2">
          {icfg && (
            <span className={`${icfg.color} text-white w-8 h-8 flex items-center justify-center rounded-lg`}>
              {icfg.icon}
            </span>
          )}
          <h2 className="text-base font-semibold text-on-surface">Choose {label} accounts to connect</h2>
        </div>
        <p className="text-xs text-on-surface-variant mb-5">
          Select all you'd like to connect. Click a selected account to mark it as ★ default for agent auto-posting.
        </p>

        {loading && <div className="h-24 rounded-xl bg-surface-container-high animate-pulse" />}

        {!loading && error && <p className="text-sm text-red-400">{error}</p>}

        {!loading && !error && (
          <div className="flex flex-col gap-2 mb-5">
            {options.map((opt, i) => {
              const isSelected = selected.has(i)
              const isDefault = defaultIndex === i
              return (
                <div
                  key={i}
                  onClick={() => isSelected ? setAsDefault(i) : toggleSelect(i)}
                  className={`flex items-center gap-3 rounded-xl px-4 py-3 cursor-pointer transition-colors border ${
                    isSelected
                      ? isDefault
                        ? 'border-indigo-500 bg-indigo-900/20'
                        : 'border-surface-container-high bg-surface-container-high'
                      : 'border-surface-container-high bg-surface-container opacity-60'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(i)}
                    onClick={e => e.stopPropagation()}
                    className="w-4 h-4 accent-indigo-500"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-on-surface">{opt.displayName}</p>
                    <p className="text-xs text-on-surface-variant">@{opt.username}</p>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${
                    opt.accountType === 'personal'
                      ? 'bg-blue-900/30 text-blue-400'
                      : 'bg-green-900/30 text-green-400'
                  }`}>
                    {opt.accountType.toUpperCase()}
                  </span>
                  {isSelected && isDefault && (
                    <span className="text-[10px] px-2 py-0.5 rounded font-semibold bg-indigo-900/40 text-indigo-300">
                      ★ default
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <p className="text-[10px] text-on-surface-variant mb-4">
          ★ Click a selected account to set it as the default. Agents auto-post to the default unless told otherwise.
        </p>

        <div className="flex gap-3">
          <button
            onClick={handleConfirm}
            disabled={saving || selected.size === 0}
            className="flex-1 bg-white text-black rounded-lg py-2.5 text-sm font-semibold hover:bg-white/90 transition-colors disabled:opacity-50"
          >
            {saving ? 'Connecting…' : `Connect selected (${selected.size})`}
          </button>
          <button
            onClick={onSkip}
            className="border border-surface-container-high text-on-surface-variant rounded-lg px-4 py-2.5 text-sm hover:bg-surface-container-high transition-colors"
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  )
}

function BlueskyForm({ onSuccess, orgId }: { onSuccess: () => void; orgId: string }) {
  const [handle, setHandle] = useState('')
  const [appPassword, setAppPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!handle.trim() || !appPassword.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      const qs = orgId ? `?orgId=${orgId}` : ''
      const res = await fetch(`/api/v1/social/accounts${qs}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: 'bluesky',
          displayName: handle.trim(),
          username: handle.trim(),
          status: 'active',
          platformMeta: { handle: handle.trim(), appPassword: appPassword.trim() },
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Failed (${res.status})`)
      }
      setHandle('')
      setAppPassword('')
      onSuccess()
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl bg-surface-container p-5 space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <PlatformBadge platformId="bluesky" />
        <span className="text-sm font-medium text-on-surface">Connect Bluesky</span>
        <span className="text-xs text-on-surface-variant">(App Password)</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input
          type="text"
          placeholder="you.bsky.social"
          value={handle}
          onChange={e => setHandle(e.target.value)}
          className="w-full px-3 py-2 rounded-lg bg-surface-container-high text-on-surface text-sm placeholder:text-on-surface-variant/40 outline-none focus:ring-1 focus:ring-white/20"
        />
        <input
          type="password"
          placeholder="xxxx-xxxx-xxxx-xxxx"
          value={appPassword}
          onChange={e => setAppPassword(e.target.value)}
          className="w-full px-3 py-2 rounded-lg bg-surface-container-high text-on-surface text-sm placeholder:text-on-surface-variant/40 outline-none focus:ring-1 focus:ring-white/20"
        />
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={submitting || !handle.trim() || !appPassword.trim()}
        className="px-4 py-2 rounded-lg bg-white text-black font-label text-sm font-medium hover:bg-white/90 transition-colors disabled:opacity-50"
      >
        {submitting ? 'Connecting…' : 'Connect Bluesky'}
      </button>
    </form>
  )
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function AccountsPage() {
  const { orgId } = useOrg()
  const searchParams = useSearchParams()
  const router = useRouter()
  const [accounts, setAccounts] = useState<SocialAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null)

  // Picker state
  const pickerNonce = searchParams.get('picker')
  const pickerPlatform = searchParams.get('platform') ?? ''

  const fetchAccounts = useCallback(async () => {
    setLoading(true)
    try {
      const qs = orgId ? `?orgId=${orgId}` : ''
      const res = await fetch(`/api/v1/social/accounts${qs}`)
      const body = await res.json()
      setAccounts(body.data ?? [])
    } catch {
      setAccounts([])
    } finally {
      setLoading(false)
    }
  }, [orgId])

  useEffect(() => { fetchAccounts() }, [fetchAccounts])

  async function handleDisconnect(id: string) {
    if (!confirm('Disconnect this account? You can reconnect later.')) return
    setDisconnectingId(id)
    try {
      const qs = orgId ? `?orgId=${orgId}` : ''
      const res = await fetch(`/api/v1/social/accounts/${id}${qs}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`Failed (${res.status})`)
      await fetchAccounts()
    } catch {
      // Account stays in list
    } finally {
      setDisconnectingId(null)
    }
  }

  async function handleSetDefault(id: string) {
    try {
      const qs = orgId ? `?orgId=${orgId}` : ''
      await fetch(`/api/v1/social/accounts/${id}/set-default${qs}`, { method: 'PUT' })
      await fetchAccounts()
    } catch { /* silently fail */ }
  }

  function dismissPicker() {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('picker')
    params.delete('platform')
    router.replace(`/admin/social/accounts?${params.toString()}`)
  }

  function handlePickerConfirm() {
    dismissPicker()
    fetchAccounts()
  }

  // Group active accounts by platform
  const activeAccounts = accounts.filter(a => a.status !== 'disconnected')
  const grouped = activeAccounts.reduce<Record<string, SocialAccount[]>>((acc, a) => {
    if (!acc[a.platform]) acc[a.platform] = []
    acc[a.platform].push(a)
    return acc
  }, {})

  const connectedPlatforms = new Set(activeAccounts.map(a => a.platform))
  const unconnectedOAuth = OAUTH_PLATFORMS.filter(p => !connectedPlatforms.has(p))
  const showBlueskyForm = !connectedPlatforms.has('bluesky')

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      {pickerNonce && (
        <PickerModal
          nonce={pickerNonce}
          platform={pickerPlatform}
          orgId={orgId ?? ''}
          onConfirm={handlePickerConfirm}
          onSkip={dismissPicker}
        />
      )}

      <div>
        <h1 className="text-2xl font-semibold text-on-surface">Social Accounts</h1>
        <p className="text-sm text-on-surface-variant mt-1">
          Connect and manage your social media accounts. Click ☆ on any account to set it as the agent default.
        </p>
      </div>

      {/* Connected Accounts */}
      <div>
        <h2 className="text-sm font-semibold text-on-surface-variant uppercase tracking-wide mb-3">
          Connected Accounts
        </h2>
        {loading ? (
          <div className="space-y-3">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="h-24 rounded-xl bg-surface-container animate-pulse" />
            ))}
          </div>
        ) : Object.keys(grouped).length === 0 ? (
          <div className="rounded-xl bg-surface-container p-8 text-center">
            <p className="text-sm text-on-surface-variant">No accounts connected yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {Object.entries(grouped).map(([platform, accs]) => (
              <PlatformCard
                key={platform}
                platform={platform}
                accounts={accs}
                orgId={orgId ?? ''}
                onDisconnect={handleDisconnect}
                onSetDefault={handleSetDefault}
                disconnectingId={disconnectingId}
              />
            ))}
          </div>
        )}
      </div>

      {/* Connect New Accounts */}
      {(unconnectedOAuth.length > 0 || showBlueskyForm) && (
        <div>
          <h2 className="text-sm font-semibold text-on-surface-variant uppercase tracking-wide mb-3">
            Connect New Account
          </h2>
          {unconnectedOAuth.length > 0 && (
            <div className="flex gap-3 flex-wrap mb-4">
              {unconnectedOAuth.map(p => (
                <a
                  key={p}
                  href={`/api/v1/social/oauth/${p}?redirectUrl=/admin/social/accounts${orgId ? `&orgId=${orgId}` : ''}`}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white text-black font-label text-sm font-medium hover:bg-white/90 transition-colors"
                >
                  <span className={`${PLATFORM_ICONS[p]?.color ?? 'bg-gray-600'} text-white w-6 h-6 flex items-center justify-center rounded`}>
                    {PLATFORM_ICONS[p]?.icon}
                  </span>
                  Connect {PLATFORM_LABELS[p] ?? p}
                </a>
              ))}
            </div>
          )}
          {showBlueskyForm && <BlueskyForm onSuccess={fetchAccounts} orgId={orgId ?? ''} />}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
cd partnersinbiz-web && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "app/(admin)/admin/social/accounts/page.tsx"
git commit -m "feat: accounts page — grouped platform cards, picker modal, set-default UI"
```

---

## Task 6: Skill update

**Files:**
- Modify: `.claude/skills/social-media-manager/SKILL.md`

- [ ] **Step 1: Add multi-account section to the skill**

Find the section in `.claude/skills/social-media-manager/SKILL.md` that covers social accounts (look for `## Accounts` or `## Social Accounts` or the connected accounts section). Add the following section immediately after it:

```markdown
## Multi-Account Platforms (Facebook & LinkedIn)

Facebook and LinkedIn support multiple sub-accounts per OAuth connection — a personal profile plus one or more business pages. Each sub-account is stored as a separate `social_accounts` doc with its own `accountId`.

### Sub-account types
- `subAccountType: 'personal'` — personal profile (posts as the individual)
- `subAccountType: 'page'` — business/company page (posts as the org)

### Default account
Each platform has one `isDefault: true` account. Agents use this by default when no `accountIds` is specified on a post. This is set by the user in the accounts page (★ badge).

### Listing sub-accounts for a platform
```
GET /api/v1/social/accounts?platform=linkedin&orgId=<orgId>
Authorization: Bearer <AI_API_KEY>
X-Org-Id: <orgId>
```
Returns all accounts for that platform including `id`, `displayName`, `subAccountType`, `isDefault`.

### Targeting a specific sub-account
Include `accountIds` on the post body to override default resolution:
```json
{
  "platform": "linkedin",
  "content": "Check out our latest update...",
  "accountIds": ["<specific-account-id>"]
}
```

### Which platforms support multiple sub-accounts
- **Facebook** — personal profile + managed pages
- **LinkedIn** — personal profile + administered org pages
- All other platforms (X, Bluesky, Instagram, etc.) — single account only

### Agent decision guide
- Post as the company/brand → use the page sub-account (usually `isDefault`)
- Post as the founder/individual → use the personal sub-account (specify `accountIds`)
- No preference given → use default (do not specify `accountIds`)
```

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/social-media-manager/SKILL.md
git commit -m "docs: update social-media-manager skill with multi-account platform guide"
```

---

## Task 7: Final check + push

- [ ] **Step 1: Run full test suite**

```bash
cd partnersinbiz-web && npx jest --no-coverage 2>&1 | tail -20
```

Expected: all previously passing tests still pass + new tests pass.

- [ ] **Step 2: Full type-check**

```bash
cd partnersinbiz-web && npx tsc --noEmit 2>&1 | head -20
```

Expected: no output.

- [ ] **Step 3: Push**

```bash
git push
```

---

## Self-Review

**Spec coverage check:**
- ✅ OAuth callback writes pending doc for Facebook + LinkedIn (Task 1)
- ✅ `social_oauth_pending` collection created by callback (Task 1)
- ✅ GET pending endpoint — no token exposure (Task 2)
- ✅ POST confirm — multi-select, one default, upsert, delete pending (Task 3)
- ✅ PUT set-default — flips flag, clears siblings (Task 4)
- ✅ `findDefaultAccount` prefers `isDefault=true` (Task 4)
- ✅ Accounts page — grouped cards, sub-account rows, PERSONAL/PAGE badges (Task 5)
- ✅ Picker modal — multi-select, default selection, confirm/skip (Task 5)
- ✅ Compose page — no change needed (existing `accountIds` reference per doc) ✅
- ✅ Skill update — sub-account types, default, targeting, platform list (Task 6)
- ✅ Migration — fallback in resolver handles old docs without `isDefault` ✅

**Type consistency:**
- `PendingOption.accountType` = `'personal' | 'page'` matches `social_accounts.subAccountType`
- `selections[].index` refers to `pending.options[index]` — consistent throughout Tasks 2, 3, 5
- `orgId` query param pattern consistent across all new endpoints (mirrors existing routes)
