# Phase 7 — AI Context Endpoint + Search

**Goal:** Add a global search API across contacts/deals/emails, plus an AI-powered contact brief endpoint that synthesises CRM history into a concise briefing using Claude. Wire both into the admin UI.

**Tech Stack:** Next.js 16 App Router, Firebase Admin SDK, `ai` (AI Gateway — plain `"provider/model"` strings), TypeScript, Jest + ts-jest

**Env required:** Run `vercel link` → enable AI Gateway in Vercel dashboard → `vercel env pull` to provision `VERCEL_OIDC_TOKEN` locally. OIDC tokens auto-refresh on Vercel deployments — no manual key management needed.

---

### Task 1: Install AI SDK packages

- [ ] **Step 1: Install packages**

```bash
cd /Users/peetstander/.config/superpowers/worktrees/partnersinbiz-web/phase1-foundation
npm install ai @ai-sdk/anthropic
```

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add AI SDK and Anthropic provider packages"
```

---

### Task 2: Search API

**Files:**
- Create: `app/api/v1/search/route.ts`
- Create: `__tests__/api/search.test.ts`

Fetches all non-deleted contacts/deals/emails (capped at 200 each), filters in-memory on the query string, returns grouped results.

- [ ] **Step 1: Write failing tests**

```typescript
// __tests__/api/search.test.ts
import { NextRequest } from 'next/server'

const mockGet = jest.fn()
const mockCollection = jest.fn()
const mockWhere = jest.fn()
const mockOrderBy = jest.fn()
const mockLimit = jest.fn()

jest.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: mockCollection },
}))
jest.mock('@/lib/auth/middleware', () => ({
  withAuth: (_role: string, handler: Function) => handler,
}))

process.env.AI_API_KEY = 'test-key'

beforeEach(() => {
  jest.clearAllMocks()
  const query = { where: mockWhere, orderBy: mockOrderBy, limit: mockLimit, get: mockGet }
  mockWhere.mockReturnValue(query)
  mockOrderBy.mockReturnValue(query)
  mockLimit.mockReturnValue(query)
  mockCollection.mockReturnValue(query)
})

describe('GET /api/v1/search', () => {
  it('returns 400 when q is missing', async () => {
    const { GET } = await import('@/app/api/v1/search/route')
    const req = new NextRequest('http://localhost/api/v1/search')
    const res = await GET(req)
    expect(res.status).toBe(400)
  })

  it('searches across contacts, deals, emails', async () => {
    mockGet
      .mockResolvedValueOnce({ docs: [
        { id: 'c1', data: () => ({ name: 'Alice Smith', email: 'alice@example.com', company: 'Acme' }) },
        { id: 'c2', data: () => ({ name: 'Bob Jones', email: 'bob@other.com', company: 'Globex' }) },
      ]})
      .mockResolvedValueOnce({ docs: [
        { id: 'd1', data: () => ({ name: 'Alice project', value: 5000 }) },
        { id: 'd2', data: () => ({ name: 'Unrelated deal', value: 1000 }) },
      ]})
      .mockResolvedValueOnce({ docs: [
        { id: 'e1', data: () => ({ subject: 'Hello Alice', to: 'alice@example.com' }) },
      ]})

    const { GET } = await import('@/app/api/v1/search/route')
    const req = new NextRequest('http://localhost/api/v1/search?q=alice')
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.contacts).toHaveLength(1)
    expect(body.data.contacts[0].id).toBe('c1')
    expect(body.data.deals).toHaveLength(1)
    expect(body.data.deals[0].id).toBe('d1')
    expect(body.data.emails).toHaveLength(1)
    expect(body.data.emails[0].id).toBe('e1')
  })

  it('returns empty results when nothing matches', async () => {
    mockGet
      .mockResolvedValueOnce({ docs: [{ id: 'c1', data: () => ({ name: 'Bob', email: 'b@b.com', company: 'B' }) }] })
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [] })

    const { GET } = await import('@/app/api/v1/search/route')
    const req = new NextRequest('http://localhost/api/v1/search?q=zzznotfound')
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.contacts).toHaveLength(0)
    expect(body.data.deals).toHaveLength(0)
    expect(body.data.emails).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest __tests__/api/search.test.ts --no-coverage 2>&1 | tail -10
```

- [ ] **Step 3: Implement the route**

```typescript
// app/api/v1/search/route.ts
import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/auth/middleware'
import { apiSuccess, apiError } from '@/lib/api/response'

export const dynamic = 'force-dynamic'

function matches(doc: Record<string, any>, q: string): boolean {
  const lower = q.toLowerCase()
  return Object.values(doc).some((v) =>
    typeof v === 'string' && v.toLowerCase().includes(lower)
  )
}

export const GET = withAuth('admin', async (req: NextRequest) => {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim()
  if (!q || q.length < 1) return apiError('q is required', 400)

  const [contactsSnap, dealsSnap, emailsSnap] = await Promise.all([
    (adminDb.collection('contacts') as any).where('deleted', '!=', true).limit(200).get(),
    (adminDb.collection('deals') as any).where('deleted', '!=', true).limit(200).get(),
    (adminDb.collection('emails') as any).where('deleted', '!=', true).limit(200).get(),
  ])

  const contacts = contactsSnap.docs
    .map((d: any) => ({ id: d.id, ...d.data() }))
    .filter((d: any) => matches(d, q))
    .slice(0, 20)

  const deals = dealsSnap.docs
    .map((d: any) => ({ id: d.id, ...d.data() }))
    .filter((d: any) => matches(d, q))
    .slice(0, 20)

  const emails = emailsSnap.docs
    .map((d: any) => ({ id: d.id, ...d.data() }))
    .filter((d: any) => matches(d, q))
    .slice(0, 20)

  return apiSuccess({ contacts, deals, emails, query: q })
})
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest __tests__/api/search.test.ts --no-coverage 2>&1 | tail -10
```
Expected: 3 passing

- [ ] **Step 5: Commit**

```bash
git add app/api/v1/search/route.ts __tests__/api/search.test.ts
git commit -m "feat: add global search API across contacts, deals, and emails"
```

---

### Task 3: AI Contact Brief API

**Files:**
- Create: `lib/ai/client.ts`
- Create: `app/api/v1/ai/contact-brief/[id]/route.ts`
- Create: `__tests__/api/ai-contact-brief.test.ts`

Fetches contact + activities (last 10) + emails (last 5) + deals, formats context, calls Claude Haiku to produce a concise 3–5 sentence brief.

- [ ] **Step 1: Create AI client helper**

```typescript
// lib/ai/client.ts
// AI Gateway: plain "provider/model" strings route automatically through the gateway.
// Auth: run `vercel link` + `vercel env pull` to provision VERCEL_OIDC_TOKEN locally.
// On Vercel deployments OIDC tokens are auto-refreshed — no manual key management.
export const BRIEF_MODEL = 'anthropic/claude-haiku-4.5'
```

- [ ] **Step 2: Write failing tests**

```typescript
// __tests__/api/ai-contact-brief.test.ts
import { NextRequest } from 'next/server'

const mockGet = jest.fn()
const mockDoc = jest.fn()
const mockCollection = jest.fn()
const mockWhere = jest.fn()
const mockOrderBy = jest.fn()
const mockLimit = jest.fn()
const mockGenerateText = jest.fn()

jest.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: mockCollection, doc: mockDoc },
}))
jest.mock('@/lib/auth/middleware', () => ({
  withAuth: (_role: string, handler: Function) => handler,
}))
jest.mock('@/lib/ai/client', () => ({
  BRIEF_MODEL: 'anthropic/claude-haiku-4.5',
}))
jest.mock('ai', () => ({
  generateText: mockGenerateText,
}))

process.env.AI_API_KEY = 'test-key'

type Params = { params: Promise<{ id: string }> }

beforeEach(() => {
  jest.clearAllMocks()
  const query = { where: mockWhere, orderBy: mockOrderBy, limit: mockLimit, get: mockGet }
  mockWhere.mockReturnValue(query)
  mockOrderBy.mockReturnValue(query)
  mockLimit.mockReturnValue(query)
  mockCollection.mockReturnValue(query)
})

describe('GET /api/v1/ai/contact-brief/[id]', () => {
  it('returns 404 when contact not found', async () => {
    mockDoc.mockReturnValue({ get: jest.fn().mockResolvedValue({ exists: false }) })
    const { GET } = await import('@/app/api/v1/ai/contact-brief/[id]/route')
    const req = new NextRequest('http://localhost/api/v1/ai/contact-brief/c1')
    const ctx: Params = { params: Promise.resolve({ id: 'c1' }) }
    const res = await GET(req, ctx)
    expect(res.status).toBe(404)
  })

  it('returns AI-generated brief for an existing contact', async () => {
    mockDoc.mockReturnValue({
      get: jest.fn().mockResolvedValue({
        exists: true,
        data: () => ({ name: 'Alice Smith', email: 'alice@example.com', company: 'Acme', stage: 'proposal' }),
      }),
    })
    mockGet
      .mockResolvedValueOnce({ docs: [
        { data: () => ({ type: 'email_sent', note: 'Sent intro email', createdAt: null }) },
      ]})
      .mockResolvedValueOnce({ docs: [
        { data: () => ({ subject: 'Intro', bodyText: 'Hello!', status: 'opened', createdAt: null }) },
      ]})
      .mockResolvedValueOnce({ docs: [
        { data: () => ({ name: 'Acme website', value: 5000, stage: 'proposal' }) },
      ]})

    mockGenerateText.mockResolvedValue({ text: 'Alice Smith is a prospect at Acme in proposal stage.' })

    const { GET } = await import('@/app/api/v1/ai/contact-brief/[id]/route')
    const req = new NextRequest('http://localhost/api/v1/ai/contact-brief/c1')
    const ctx: Params = { params: Promise.resolve({ id: 'c1' }) }
    const res = await GET(req, ctx)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.brief).toBe('Alice Smith is a prospect at Acme in proposal stage.')
    expect(mockGenerateText).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npx jest __tests__/api/ai-contact-brief.test.ts --no-coverage 2>&1 | tail -10
```

- [ ] **Step 4: Implement the route**

```typescript
// app/api/v1/ai/contact-brief/[id]/route.ts
import { NextRequest } from 'next/server'
import { generateText } from 'ai'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/auth/middleware'
import { apiSuccess, apiError } from '@/lib/api/response'
import { getAnthropic, BRIEF_MODEL } from '@/lib/ai/client'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export const GET = withAuth('admin', async (req: NextRequest, context?: unknown) => {
  const { id } = await (context as Params).params

  // Fetch contact
  const contactRef = adminDb.doc(`contacts/${id}`)
  const contactSnap = await contactRef.get()
  if (!contactSnap.exists) return apiError('Contact not found', 404)
  const contact = contactSnap.data()!

  // Fetch supporting data in parallel
  const [activitiesSnap, emailsSnap, dealsSnap] = await Promise.all([
    (adminDb.collection('activities') as any)
      .where('contactId', '==', id)
      .orderBy('createdAt', 'desc')
      .limit(10)
      .get(),
    (adminDb.collection('emails') as any)
      .where('contactId', '==', id)
      .orderBy('createdAt', 'desc')
      .limit(5)
      .get(),
    (adminDb.collection('deals') as any)
      .where('contactId', '==', id)
      .where('deleted', '!=', true)
      .get(),
  ])

  const activities = activitiesSnap.docs.map((d: any) => d.data())
  const emails = emailsSnap.docs.map((d: any) => d.data())
  const deals = dealsSnap.docs.map((d: any) => d.data())

  // Build context string
  const context_str = [
    `Contact: ${contact.name} (${contact.email}) at ${contact.company ?? 'unknown company'}`,
    `Stage: ${contact.stage ?? 'none'}, Type: ${contact.type ?? 'none'}`,
    contact.notes ? `Notes: ${contact.notes}` : '',
    deals.length > 0
      ? `Deals: ${deals.map((d: any) => `${d.name} ($${d.value}, ${d.stage})`).join('; ')}`
      : 'No active deals.',
    activities.length > 0
      ? `Recent activity: ${activities.slice(0, 5).map((a: any) => `${a.type}: ${a.note}`).join('; ')}`
      : 'No recent activity.',
    emails.length > 0
      ? `Recent emails: ${emails.map((e: any) => `"${e.subject}" (${e.status})`).join('; ')}`
      : 'No emails sent.',
  ].filter(Boolean).join('\n')

  const { text } = await generateText({
    model: getAnthropic()(BRIEF_MODEL),
    system: 'You are a B2B sales assistant. Write a concise 3–5 sentence brief about this prospect suitable for a sales rep about to reach out. Be specific, practical, and highlight the most important context.',
    prompt: context_str,
    maxTokens: 300,
  })

  return apiSuccess({ brief: text, contactId: id })
})
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx jest __tests__/api/ai-contact-brief.test.ts --no-coverage 2>&1 | tail -10
```
Expected: 2 passing

- [ ] **Step 6: Commit**

```bash
git add lib/ai/client.ts "app/api/v1/ai/contact-brief/[id]/route.ts" __tests__/api/ai-contact-brief.test.ts
git commit -m "feat: add AI contact brief endpoint using Claude Haiku"
```

---

### Task 4: Global Search UI

**Files:**
- Create: `components/admin/GlobalSearch.tsx`
- Modify: `app/(admin)/admin/layout.tsx` — add GlobalSearch to the nav

- [ ] **Step 1: Create the GlobalSearch component**

```typescript
// components/admin/GlobalSearch.tsx
'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'

interface SearchResult {
  id: string
  name?: string
  email?: string
  subject?: string
  company?: string
  [key: string]: any
}

interface SearchResults {
  contacts: SearchResult[]
  deals: SearchResult[]
  emails: SearchResult[]
  query: string
}

export default function GlobalSearch() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResults | null>(null)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!query.trim() || query.length < 2) { setResults(null); return }
    const timer = setTimeout(() => {
      setLoading(true)
      fetch(`/api/v1/search?q=${encodeURIComponent(query)}`)
        .then((r) => r.json())
        .then((b) => { setResults(b.data); setLoading(false) })
        .catch(() => setLoading(false))
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const totalResults = results
    ? results.contacts.length + results.deals.length + results.emails.length
    : 0

  return (
    <div ref={containerRef} className="relative">
      <div
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-container text-on-surface-variant text-sm cursor-text min-w-[200px]"
        onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 0) }}
      >
        <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder="Search..."
          className="bg-transparent outline-none text-sm text-on-surface placeholder:text-on-surface-variant flex-1 min-w-0"
        />
        {loading && (
          <div className="w-3 h-3 border border-on-surface-variant border-t-transparent rounded-full animate-spin flex-shrink-0" />
        )}
      </div>

      {open && query.length >= 2 && (
        <div className="absolute top-full mt-1 left-0 w-80 rounded-xl bg-surface-container border border-outline-variant shadow-lg z-50 overflow-hidden">
          {!results && loading ? (
            <div className="p-4 text-sm text-on-surface-variant text-center">Searching...</div>
          ) : results && totalResults === 0 ? (
            <div className="p-4 text-sm text-on-surface-variant text-center">No results for "{query}"</div>
          ) : results && totalResults > 0 ? (
            <div className="max-h-96 overflow-y-auto">
              {results.contacts.length > 0 && (
                <div>
                  <p className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">Contacts</p>
                  {results.contacts.map((c) => (
                    <Link key={c.id} href={`/admin/crm/contacts/${c.id}`} onClick={() => { setOpen(false); setQuery('') }}
                      className="flex flex-col px-3 py-2 hover:bg-surface-container-high transition-colors">
                      <span className="text-sm font-medium text-on-surface">{c.name}</span>
                      <span className="text-xs text-on-surface-variant">{c.email}{c.company ? ` · ${c.company}` : ''}</span>
                    </Link>
                  ))}
                </div>
              )}
              {results.deals.length > 0 && (
                <div>
                  <p className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">Deals</p>
                  {results.deals.map((d) => (
                    <Link key={d.id} href={`/admin/crm/pipeline`} onClick={() => { setOpen(false); setQuery('') }}
                      className="flex flex-col px-3 py-2 hover:bg-surface-container-high transition-colors">
                      <span className="text-sm font-medium text-on-surface">{d.name}</span>
                      <span className="text-xs text-on-surface-variant">{d.stage}{d.value ? ` · $${d.value.toLocaleString()}` : ''}</span>
                    </Link>
                  ))}
                </div>
              )}
              {results.emails.length > 0 && (
                <div>
                  <p className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">Emails</p>
                  {results.emails.map((e) => (
                    <Link key={e.id} href={`/admin/email`} onClick={() => { setOpen(false); setQuery('') }}
                      className="flex flex-col px-3 py-2 hover:bg-surface-container-high transition-colors">
                      <span className="text-sm font-medium text-on-surface">{e.subject}</span>
                      <span className="text-xs text-on-surface-variant">{e.to} · {e.status}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Add GlobalSearch to admin layout nav**

Read `app/(admin)/admin/layout.tsx`, then add `<GlobalSearch />` to the top nav bar.

- [ ] **Step 3: Commit**

```bash
git add components/admin/GlobalSearch.tsx "app/(admin)/admin/layout.tsx"
git commit -m "feat: add global search UI with debounced results dropdown"
```

---

### Task 5: Contact AI Brief UI

**Files:**
- Create: `components/admin/crm/ContactBrief.tsx`
- Modify: `app/(admin)/admin/crm/contacts/[id]/page.tsx` — add AI Brief section

- [ ] **Step 1: Create ContactBrief component**

```typescript
// components/admin/crm/ContactBrief.tsx
'use client'

import { useState } from 'react'

interface Props {
  contactId: string
}

export default function ContactBrief({ contactId }: Props) {
  const [brief, setBrief] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function generate() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/v1/ai/contact-brief/${contactId}`)
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Failed to generate brief')
      setBrief(body.data.brief)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-xl bg-surface-container p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-on-surface-variant uppercase tracking-wide">AI Brief</h3>
        <button
          onClick={generate}
          disabled={loading}
          className="px-3 py-1 rounded-lg bg-primary text-on-primary text-xs font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {loading ? 'Generating…' : brief ? 'Regenerate' : 'Generate Brief'}
        </button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      {brief ? (
        <p className="text-sm text-on-surface leading-relaxed">{brief}</p>
      ) : !loading && (
        <p className="text-xs text-on-surface-variant">
          Click "Generate Brief" to get an AI summary of this contact's history and deal status.
        </p>
      )}
      {loading && (
        <div className="space-y-2">
          <div className="h-3 bg-surface-container-high animate-pulse rounded" />
          <div className="h-3 bg-surface-container-high animate-pulse rounded w-4/5" />
          <div className="h-3 bg-surface-container-high animate-pulse rounded w-3/5" />
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Add ContactBrief to contact detail page**

Read the contact detail page at `app/(admin)/admin/crm/contacts/[id]/page.tsx`, then add `<ContactBrief contactId={id} />` in the sidebar or below the activity timeline.

- [ ] **Step 3: Commit**

```bash
git add components/admin/crm/ContactBrief.tsx "app/(admin)/admin/crm/contacts/[id]/page.tsx"
git commit -m "feat: add AI contact brief component to contact detail page"
```

---

### Task 6: Full Test Suite + Build Check

- [ ] **Step 1: Run all tests**

```bash
npx jest --no-coverage 2>&1 | tail -20
```
Expected: All suites passing

- [ ] **Step 2: Run production build**

```bash
npx next build 2>&1 | tail -30
```
Expected: ✓ compiled successfully

- [ ] **Step 3: Commit fixes if needed**

```bash
git add -A && git commit -m "fix: resolve Phase 7 test or build issues"
```
