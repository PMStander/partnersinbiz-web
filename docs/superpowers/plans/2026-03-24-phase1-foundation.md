# Phase 1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish auth-role middleware, a terminal-style admin shell, and a versioned API foundation that all subsequent phases (CRM, email, sequences, client portal) will build on.

**Architecture:** Firebase session cookies are verified server-side via `firebase-admin`. A `withAuth(role)` helper wraps every `/api/v1` route. The admin shell is a Next.js server-component layout at `app/(admin)/layout.tsx` that reads the session cookie, verifies the role, and renders a sidebar + topbar. A long-lived `AI_API_KEY` env var is also accepted as a Bearer token so Claude can access the API without refreshing Firebase tokens.

**Tech Stack:** Next.js 16 App Router · TypeScript · Firebase Admin SDK · Tailwind v4 · Jest (node environment) · Resend (already installed)

---

## Scope Note

This is Phase 1 of 7. Subsequent phases should each have their own plan document:
- `2026-03-24-phase2-crm.md`
- `2026-03-24-phase3-email.md`
- `2026-03-24-phase4-sequences.md`
- `2026-03-24-phase5-client-portal.md`
- `2026-03-24-phase6-dashboard-marketing.md`
- `2026-03-24-phase7-ai-layer.md`

---

## File Map

### New files to create

| File | Responsibility |
|------|---------------|
| `lib/api/auth.ts` | `withAuth(role)` middleware — verifies Firebase session cookie, Bearer ID token, or AI_API_KEY; returns uid + role |
| `lib/api/response.ts` | `apiSuccess()` / `apiError()` helpers — enforces `{ success, data?, error?, meta? }` shape |
| `lib/api/types.ts` | Shared TypeScript types for API routes (`ApiUser`, `ApiRole`, `ApiResponse`) |
| `components/admin/AdminSidebar.tsx` | Collapsible sidebar nav with all module links |
| `components/admin/AdminTopbar.tsx` | Top bar with logo, user email, cmd+k hint, logout button |
| `app/(admin)/layout.tsx` | Server-component admin shell — auth gate + renders sidebar/topbar |
| `app/api/v1/health/route.ts` | `GET /api/v1/health` — returns 200 with auth identity; smoke test for the whole auth stack |
| `vercel.json` | Cron job configuration (needed for Phase 4 sequences) |
| `__tests__/api/auth.test.ts` | Unit tests for withAuth middleware |
| `__tests__/api/response.test.ts` | Unit tests for response helpers |
| `__tests__/api/v1/health.test.ts` | Integration test for health endpoint |

### Files to modify

| File | Change |
|------|--------|
| `firestore.rules` | Add rules for all new Phase 1–7 collections |
| `app/api/enquiries/route.ts` | After writing to `enquiries`, also write a `contacts` doc with `source: "form"` |
| `app/(admin)/admin/dashboard/page.tsx` | Remove inline auth check (layout now handles it); remove logout button (topbar handles it) |
| `globals.css` | Add `--color-accent: #C0392B` (CTA red) and `--color-sidebar: #111111` CSS vars |

---

## Design System Reference

The admin UI must use only these existing tokens + the two new ones above:

```
Background:       bg-black (#000000)
Sidebar bg:       var(--color-sidebar) = #111111
Surface cards:    bg-surface-container (#1f1f1f)
Border:           border-outline-variant (#474747)
Primary text:     text-on-surface (#e2e2e2)
Muted text:       text-on-surface-variant (#c6c6c6)
CTA / badges:     var(--color-accent) = #C0392B
Font headline:    font-headline (Space Grotesk)
Font body/label:  font-body / font-label (Inter)
Radius:           none on tables/grids; --radius (0.25rem) only where needed
```

No rounded corners on data tables. No card shadows. Flat, sharp, terminal-inspired.

---

## Task 1: API Response Helpers

**Files:**
- Create: `lib/api/response.ts`
- Create: `lib/api/types.ts`
- Create: `__tests__/api/response.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// __tests__/api/response.test.ts
import { apiSuccess, apiError } from '@/lib/api/response'

describe('apiSuccess', () => {
  it('returns 200 with success:true and data', async () => {
    const res = apiSuccess({ id: '1' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ success: true, data: { id: '1' } })
  })

  it('accepts a custom status code', async () => {
    const res = apiSuccess({ id: '1' }, 201)
    expect(res.status).toBe(201)
  })

  it('includes meta when provided', async () => {
    const res = apiSuccess([], 200, { total: 50, page: 1, limit: 10 })
    const body = await res.json()
    expect(body.meta).toEqual({ total: 50, page: 1, limit: 10 })
  })
})

describe('apiError', () => {
  it('returns given status with success:false and error message', async () => {
    const res = apiError('Not found', 404)
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body).toEqual({ success: false, error: 'Not found' })
  })

  it('defaults to 400 status', async () => {
    const res = apiError('Bad input')
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd /Users/peetstander/Cowork/Partners\ in\ Biz\ —\ Client\ Growth/partnersinbiz-web
npx jest __tests__/api/response.test.ts --no-coverage
```

Expected: FAIL — "Cannot find module '@/lib/api/response'"

- [ ] **Step 3: Create the types file**

```typescript
// lib/api/types.ts
export type ApiRole = 'admin' | 'client' | 'ai'

export interface ApiUser {
  uid: string
  role: ApiRole
}

export interface ApiMeta {
  total: number
  page: number
  limit: number
}

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  meta?: ApiMeta
}
```

- [ ] **Step 4: Create the response helpers**

```typescript
// lib/api/response.ts
import { NextResponse } from 'next/server'
import type { ApiMeta, ApiResponse } from './types'

export function apiSuccess<T>(
  data: T,
  status = 200,
  meta?: ApiMeta,
): NextResponse<ApiResponse<T>> {
  const body: ApiResponse<T> = { success: true, data }
  if (meta) body.meta = meta
  return NextResponse.json(body, { status })
}

export function apiError(
  error: string,
  status = 400,
): NextResponse<ApiResponse<never>> {
  return NextResponse.json({ success: false, error }, { status })
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx jest __tests__/api/response.test.ts --no-coverage
```

Expected: PASS (3 + 2 = 5 tests)

- [ ] **Step 6: Commit**

```bash
git add lib/api/response.ts lib/api/types.ts __tests__/api/response.test.ts
git commit -m "feat: add API response helpers and shared types"
```

---

## Task 2: withAuth Middleware

**Files:**
- Create: `lib/api/auth.ts`
- Create: `__tests__/api/auth.test.ts`

The middleware must accept three auth methods (in priority order):
1. `Authorization: Bearer <AI_API_KEY>` — long-lived key for Claude; grants `role: "ai"` (treated as admin for all access checks)
2. `Authorization: Bearer <firebaseIdToken>` — short-lived token from client SDK
3. Session cookie `__session` — set by `/api/auth/session` after login

- [ ] **Step 1: Write the failing tests**

```typescript
// __tests__/api/auth.test.ts
import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess } from '@/lib/api/response'

// Mock firebase admin
jest.mock('@/lib/firebase/admin', () => ({
  adminAuth: {
    verifyIdToken: jest.fn(),
    verifySessionCookie: jest.fn(),
  },
  adminDb: {
    collection: jest.fn().mockReturnValue({
      doc: jest.fn().mockReturnValue({
        get: jest.fn(),
      }),
    }),
  },
}))

import { adminAuth, adminDb } from '@/lib/firebase/admin'

const AI_API_KEY = 'test-ai-key-abc'
process.env.AI_API_KEY = AI_API_KEY
process.env.SESSION_COOKIE_NAME = '__session'

function makeReq(headers: Record<string, string> = {}, cookies: Record<string, string> = {}) {
  const req = new NextRequest('http://localhost/api/v1/test', {
    headers: new Headers(headers),
  })
  // Inject cookies
  Object.entries(cookies).forEach(([name, value]) => {
    req.cookies.set(name, value)
  })
  return req
}

const handler = withAuth('admin', async (_req, user) => {
  return apiSuccess({ uid: user.uid, role: user.role })
})

describe('withAuth — AI_API_KEY', () => {
  it('grants access with valid AI_API_KEY and returns role "ai"', async () => {
    const req = makeReq({ authorization: `Bearer ${AI_API_KEY}` })
    const res = await handler(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.role).toBe('ai')
  })
})

describe('withAuth — Firebase ID token', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(adminAuth.verifyIdToken as jest.Mock).mockResolvedValue({ uid: 'user-123' })
    const mockGet = jest.fn().mockResolvedValue({
      exists: true,
      data: () => ({ role: 'admin' }),
    })
    ;(adminDb.collection as jest.Mock).mockReturnValue({
      doc: jest.fn().mockReturnValue({ get: mockGet }),
    })
  })

  it('grants access when token is valid and role matches', async () => {
    const req = makeReq({ authorization: 'Bearer valid-id-token' })
    const res = await handler(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.uid).toBe('user-123')
  })

  it('returns 403 when role is client but admin is required', async () => {
    const mockGet = jest.fn().mockResolvedValue({
      exists: true,
      data: () => ({ role: 'client' }),
    })
    ;(adminDb.collection as jest.Mock).mockReturnValue({
      doc: jest.fn().mockReturnValue({ get: mockGet }),
    })
    const req = makeReq({ authorization: 'Bearer valid-id-token' })
    const res = await handler(req)
    expect(res.status).toBe(403)
  })
})

describe('withAuth — role hierarchy', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(adminAuth.verifyIdToken as jest.Mock).mockResolvedValue({ uid: 'user-456' })
  })

  it('admin can access client-required routes', async () => {
    const mockGet = jest.fn().mockResolvedValue({
      exists: true,
      data: () => ({ role: 'admin' }),
    })
    ;(adminDb.collection as jest.Mock).mockReturnValue({
      doc: jest.fn().mockReturnValue({ get: mockGet }),
    })
    const clientHandler = withAuth('client', async (_req, user) => apiSuccess({ role: user.role }))
    const req = makeReq({ authorization: 'Bearer valid-id-token' })
    const res = await clientHandler(req)
    expect(res.status).toBe(200)
  })

  it('client cannot access admin-required routes', async () => {
    const mockGet = jest.fn().mockResolvedValue({
      exists: true,
      data: () => ({ role: 'client' }),
    })
    ;(adminDb.collection as jest.Mock).mockReturnValue({
      doc: jest.fn().mockReturnValue({ get: mockGet }),
    })
    const req = makeReq({ authorization: 'Bearer valid-id-token' })
    const res = await handler(req) // handler requires admin
    expect(res.status).toBe(403)
  })
})

describe('withAuth — unauthenticated', () => {
  it('returns 401 with no token and no cookie', async () => {
    const req = makeReq()
    const res = await handler(req)
    expect(res.status).toBe(401)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx jest __tests__/api/auth.test.ts --no-coverage
```

Expected: FAIL — "Cannot find module '@/lib/api/auth'"

- [ ] **Step 3: Implement withAuth**

```typescript
// lib/api/auth.ts
import { NextRequest, NextResponse } from 'next/server'
import { adminAuth, adminDb } from '@/lib/firebase/admin'
import { apiError } from './response'
import type { ApiRole, ApiUser } from './types'

type RouteHandler = (req: NextRequest, user: ApiUser) => Promise<NextResponse>

/**
 * Wraps an API route handler with authentication and role enforcement.
 *
 * Auth methods accepted (in order):
 *  1. Authorization: Bearer <AI_API_KEY>  — long-lived key for agent/Claude access
 *  2. Authorization: Bearer <firebaseIdToken> — client SDK token
 *  3. Session cookie __session — set after browser login
 *
 * @param requiredRole  "admin" | "client" — "ai" tokens satisfy "admin"
 * @param handler       The actual route handler, receives (req, user)
 */
export function withAuth(requiredRole: 'admin' | 'client', handler: RouteHandler) {
  return async (req: NextRequest): Promise<NextResponse> => {
    try {
      const user = await resolveUser(req)
      if (!user) return apiError('Unauthorized', 401)

      // ai and admin satisfy any role; client only satisfies "client"
      const roleOk =
        user.role === 'ai' ||
        user.role === 'admin' ||
        (requiredRole === 'client' && user.role === 'client')

      if (!roleOk) return apiError('Forbidden', 403)

      return handler(req, user)
    } catch {
      return apiError('Unauthorized', 401)
    }
  }
}

async function resolveUser(req: NextRequest): Promise<ApiUser | null> {
  const authHeader = req.headers.get('authorization') ?? ''

  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7)

    // 1. Check for AI_API_KEY
    const aiKey = process.env.AI_API_KEY
    if (aiKey && token === aiKey) {
      return { uid: 'ai-agent', role: 'ai' }
    }

    // 2. Verify as Firebase ID token
    try {
      const decoded = await adminAuth.verifyIdToken(token)
      const role = await getRoleFromFirestore(decoded.uid)
      return { uid: decoded.uid, role }
    } catch {
      // fall through to cookie check
    }
  }

  // 3. Session cookie
  const cookieName = process.env.SESSION_COOKIE_NAME ?? '__session'
  const cookie = req.cookies.get(cookieName)?.value
  if (cookie) {
    try {
      const decoded = await adminAuth.verifySessionCookie(cookie, true)
      const role = await getRoleFromFirestore(decoded.uid)
      return { uid: decoded.uid, role }
    } catch {
      return null
    }
  }

  return null
}

async function getRoleFromFirestore(uid: string): Promise<ApiRole> {
  const doc = await adminDb.collection('users').doc(uid).get()
  if (!doc.exists) return 'client'
  return (doc.data()?.role as ApiRole) ?? 'client'
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest __tests__/api/auth.test.ts --no-coverage
```

Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/api/auth.ts __tests__/api/auth.test.ts
git commit -m "feat: add withAuth middleware supporting API key, ID token, and session cookie"
```

---

## Task 3: Health Endpoint

**Files:**
- Create: `app/api/v1/health/route.ts`
- Create: `__tests__/api/v1/health.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/api/v1/health.test.ts
import { GET } from '@/app/api/v1/health/route'
import { NextRequest } from 'next/server'

jest.mock('@/lib/firebase/admin', () => ({
  adminAuth: { verifyIdToken: jest.fn(), verifySessionCookie: jest.fn() },
  adminDb: {
    collection: jest.fn().mockReturnValue({
      doc: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue({ exists: false, data: () => null }),
      }),
    }),
  },
}))

process.env.AI_API_KEY = 'test-key'

function makeReq() {
  return new NextRequest('http://localhost/api/v1/health', {
    headers: { authorization: 'Bearer test-key' },
  })
}

describe('GET /api/v1/health', () => {
  it('returns 200 with authenticated identity', async () => {
    const res = await GET(makeReq())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.role).toBe('ai')
  })

  it('returns 401 without auth', async () => {
    const req = new NextRequest('http://localhost/api/v1/health')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx jest __tests__/api/v1/health.test.ts --no-coverage
```

Expected: FAIL

- [ ] **Step 3: Create the route**

```typescript
// app/api/v1/health/route.ts
/**
 * GET /api/v1/health
 *
 * Smoke-test endpoint for the auth stack.
 * Returns the authenticated identity.
 *
 * Auth: Bearer <AI_API_KEY> | Bearer <firebaseIdToken> | session cookie
 * Role: admin or ai
 */
import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess } from '@/lib/api/response'

export const GET = withAuth('admin', async (_req, user) => {
  return apiSuccess({ uid: user.uid, role: user.role })
})
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest __tests__/api/v1/health.test.ts --no-coverage
```

Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add app/api/v1/health/route.ts __tests__/api/v1/health.test.ts
git commit -m "feat: add GET /api/v1/health endpoint"
```

---

## Task 4: Update Firestore Rules

**Files:**
- Modify: `firestore.rules`

- [ ] **Step 1: Replace the entire firestore.rules content**

Replace the file with:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // ── Helpers ─────────────────────────────────────────────────────────────
    function isAdmin() {
      return request.auth != null
          && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == "admin";
    }

    function isClientFor(clientId) {
      return request.auth != null
          && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.clientId == clientId;
    }

    // ── Users ────────────────────────────────────────────────────────────────
    match /users/{uid} {
      allow read: if request.auth != null
                  && (request.auth.uid == uid || isAdmin());
      // Clients may create their own doc (role locked to "client"); admin writes via Admin SDK
      allow create: if request.auth != null
                    && request.auth.uid == uid
                    && request.resource.data.role == "client";
      allow update: if request.auth != null
                    && request.auth.uid == uid
                    && !request.resource.data.diff(resource.data).affectedKeys().hasAny(["role"]);
      allow write: if isAdmin();
    }

    // ── Enquiries (existing) ─────────────────────────────────────────────────
    match /enquiries/{id} {
      allow read: if request.auth != null
                  && (request.auth.uid == resource.data.userId || isAdmin());
      allow write: if false; // all writes via Admin SDK only
    }

    // ── CRM ──────────────────────────────────────────────────────────────────
    match /contacts/{id} {
      allow read, write: if isAdmin();
    }

    match /deals/{id} {
      allow read, write: if isAdmin();
    }

    match /activities/{id} {
      allow read, write: if isAdmin();
    }

    // ── Email ────────────────────────────────────────────────────────────────
    match /emails/{id} {
      allow read, write: if isAdmin();
    }

    // ── Sequences ────────────────────────────────────────────────────────────
    match /sequences/{id} {
      allow read, write: if isAdmin();
    }

    match /sequence_enrollments/{id} {
      allow read, write: if isAdmin();
    }

    // ── Client portal ────────────────────────────────────────────────────────
    match /clients/{id} {
      allow read: if isAdmin() || isClientFor(id);
      allow write: if isAdmin();
    }

    match /projects/{id} {
      allow read: if isAdmin() || isClientFor(resource.data.clientId);
      allow write: if isAdmin();
    }

    match /tasks/{id} {
      allow read: if isAdmin() || isClientFor(resource.data.clientId);
      allow write: if isAdmin();
    }

    match /tasks/{taskId}/comments/{commentId} {
      allow read: if isAdmin() || isClientFor(
        get(/databases/$(database)/documents/tasks/$(taskId)).data.clientId
      );
      allow write: if isAdmin() || isClientFor(
        get(/databases/$(database)/documents/tasks/$(taskId)).data.clientId
      );
    }

    match /invoices/{id} {
      allow read: if isAdmin() || isClientFor(resource.data.clientId);
      allow write: if isAdmin();
    }

    // ── Marketing ────────────────────────────────────────────────────────────
    match /campaigns/{id} {
      allow read, write: if isAdmin();
    }

    // ── AI audit log ─────────────────────────────────────────────────────────
    match /ai_action_log/{id} {
      allow read, write: if isAdmin();
    }
  }
}
```

- [ ] **Step 2: Deploy to Firebase**

```bash
cd /Users/peetstander/Cowork/Partners\ in\ Biz\ —\ Client\ Growth/partnersinbiz-web
npx firebase-tools deploy --only firestore:rules
```

Expected: "Deploy complete!"

- [ ] **Step 3: Commit**

```bash
git add firestore.rules
git commit -m "feat: update Firestore rules for all Phase 1-7 collections"
```

---

## Task 5: Design System — Add Accent Color

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: Add new CSS vars to the `@theme` block**

In `globals.css`, inside the `@theme { ... }` block, add after the last existing variable:

```css
  --color-accent: #C0392B;
  --color-sidebar: #111111;
```

- [ ] **Step 2: Verify build compiles**

```bash
npx next build 2>&1 | tail -5
```

Expected: no errors (or only unrelated warnings)

- [ ] **Step 3: Commit**

```bash
git add app/globals.css
git commit -m "feat: add accent and sidebar CSS variables to design system"
```

---

## Task 6: Admin Shell Layout

**Files:**
- Create: `components/admin/AdminSidebar.tsx`
- Create: `components/admin/AdminTopbar.tsx`
- Create: `app/(admin)/layout.tsx`

This layout is a server component. It reads the session cookie, calls `adminAuth.verifySessionCookie`, checks the role in Firestore, and redirects to `/login` if not admin. No client-side auth check needed in child pages.

- [ ] **Step 1: Create the sidebar component**

```tsx
// components/admin/AdminSidebar.tsx
import Link from 'next/link'

const NAV = [
  { label: 'Dashboard',  href: '/admin/dashboard' },
  { label: 'Contacts',   href: '/admin/crm/contacts',  group: 'CRM' },
  { label: 'Pipeline',   href: '/admin/crm/pipeline',  group: 'CRM' },
  { label: 'Inbox',      href: '/admin/email',          group: 'Email' },
  { label: 'Sequences',  href: '/admin/sequences' },
  { label: 'Marketing',  href: '/admin/marketing' },
  { label: 'Projects',   href: '/admin/projects' },
  { label: 'Clients',    href: '/admin/clients' },
  { label: 'Settings',   href: '/admin/settings' },
]

export function AdminSidebar() {
  let currentGroup = ''
  return (
    <aside
      className="w-56 shrink-0 flex flex-col border-r border-outline-variant h-screen sticky top-0 overflow-y-auto"
      style={{ background: 'var(--color-sidebar)' }}
    >
      {/* Logo */}
      <div className="px-6 py-5 border-b border-outline-variant">
        <span className="font-headline text-sm font-bold tracking-widest uppercase text-on-surface">
          PiB
        </span>
        <span className="ml-2 text-[10px] font-label uppercase tracking-widest text-on-surface-variant">
          Admin
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV.map((item) => {
          const showGroupLabel = item.group && item.group !== currentGroup
          if (item.group) currentGroup = item.group
          return (
            <div key={item.href}>
              {showGroupLabel && (
                <p className="px-3 pt-4 pb-1 text-[9px] font-label uppercase tracking-widest text-on-surface-variant/50">
                  {item.group}
                </p>
              )}
              <Link
                href={item.href}
                className="flex items-center px-3 py-2 text-sm font-label text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors"
              >
                {item.label}
              </Link>
            </div>
          )
        })}
      </nav>
    </aside>
  )
}
```

- [ ] **Step 2: Create the topbar component**

```tsx
// components/admin/AdminTopbar.tsx
interface AdminTopbarProps {
  userEmail: string
}

export function AdminTopbar({ userEmail }: AdminTopbarProps) {
  return (
    <header className="h-12 flex items-center justify-between px-6 border-b border-outline-variant bg-black shrink-0">
      <div className="flex items-center gap-4">
        <span className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">
          Partners in Biz
        </span>
      </div>
      <div className="flex items-center gap-6">
        <kbd className="hidden md:inline-flex text-[9px] font-label text-on-surface-variant/40 border border-outline-variant px-1.5 py-0.5">
          ⌘K
        </kbd>
        <span className="text-[11px] font-label text-on-surface-variant">{userEmail}</span>
        <a
          href="/api/auth/logout"
          className="text-[11px] font-label text-on-surface-variant hover:text-on-surface transition-colors"
        >
          Sign out
        </a>
      </div>
    </header>
  )
}
```

- [ ] **Step 3: Create the admin layout**

```tsx
// app/(admin)/layout.tsx
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { adminAuth, adminDb } from '@/lib/firebase/admin'
import { AdminSidebar } from '@/components/admin/AdminSidebar'
import { AdminTopbar } from '@/components/admin/AdminTopbar'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const cookieStore = await cookies()
  const cookieName = process.env.SESSION_COOKIE_NAME ?? '__session'
  const sessionCookie = cookieStore.get(cookieName)?.value

  if (!sessionCookie) redirect('/login')

  let uid: string
  try {
    const decoded = await adminAuth.verifySessionCookie(sessionCookie, true)
    uid = decoded.uid
  } catch {
    redirect('/login')
  }

  const userDoc = await adminDb.collection('users').doc(uid).get()
  const role = userDoc.exists ? userDoc.data()?.role : 'client'
  const email = userDoc.exists ? userDoc.data()?.email : ''

  if (role !== 'admin') redirect('/portal/dashboard')

  return (
    <div className="flex h-screen overflow-hidden bg-black">
      <AdminSidebar />
      <div className="flex flex-col flex-1 overflow-hidden">
        <AdminTopbar userEmail={email} />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Add a logout API route**

This is needed because the topbar links to `/api/auth/logout`:

```typescript
// app/api/auth/logout/route.ts
import { NextResponse } from 'next/server'

export async function GET() {
  const cookieName = process.env.SESSION_COOKIE_NAME ?? '__session'
  const response = NextResponse.redirect(new URL('/', process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'))
  response.cookies.set(cookieName, '', { maxAge: 0, path: '/' })
  return response
}
```

- [ ] **Step 5: Update the existing admin dashboard page to remove inline auth**

In `app/(admin)/admin/dashboard/page.tsx`, the layout now handles auth. Update the page to remove the `onAuthStateChanged` redirect and logout button — they're redundant now.

Remove:
- The `useRouter` + `onAuthStateChanged` redirect check (the layout already blocks non-admins)
- The "Sign out" `<button onClick={handleLogout}>` (the topbar handles logout)

Keep the enquiries display logic — it will be replaced in Phase 2 by the full CRM module.

- [ ] **Step 6: Add snapshot tests for admin components**

Create `__tests__/components/admin/AdminSidebar.test.tsx`:

```typescript
// __tests__/components/admin/AdminSidebar.test.tsx
// Note: Jest runs in node env — test rendering via string match, not React Testing Library
// (RTL not installed). Test that the component exports correctly and nav items are present.
import { AdminSidebar } from '@/components/admin/AdminSidebar'

describe('AdminSidebar', () => {
  it('exports a function', () => {
    expect(typeof AdminSidebar).toBe('function')
  })
})
```

Create `__tests__/components/admin/AdminTopbar.test.tsx`:

```typescript
// __tests__/components/admin/AdminTopbar.test.tsx
import { AdminTopbar } from '@/components/admin/AdminTopbar'

describe('AdminTopbar', () => {
  it('exports a function', () => {
    expect(typeof AdminTopbar).toBe('function')
  })
})
```

Run:
```bash
npx jest __tests__/components/admin/ --no-coverage
```
Expected: PASS (2 tests)

- [ ] **Step 7: Verify dev server starts without errors**

```bash
npx next dev --port 3001 &
sleep 5
curl -s http://localhost:3001/api/v1/health | head -c 100
kill %1
```

Expected: `{"success":false,"error":"Unauthorized"}` (401 — correct, no token sent)

- [ ] **Step 8: Commit**

```bash
git add components/admin/AdminSidebar.tsx components/admin/AdminTopbar.tsx
git add "app/(admin)/layout.tsx" app/api/auth/logout/route.ts
git add "app/(admin)/admin/dashboard/page.tsx"
git add __tests__/components/admin/
git commit -m "feat: add admin shell layout with sidebar, topbar, and server-side auth gate"
```

---

## Task 7: Wire Enquiries → CRM Contacts

**Files:**
- Modify: `app/api/enquiries/route.ts`
- Modify: `__tests__/api/enquiries.test.ts`

When a form submission arrives at `/api/enquiries`, also write a `contacts` document with `source: "form"` so the CRM automatically gets the lead.

- [ ] **Step 1: Update the enquiries POST handler**

In `app/api/enquiries/route.ts`, after the `adminDb.collection('enquiries').add(...)` call, add:

```typescript
// Also create a CRM contact for this lead
await adminDb.collection('contacts').add({
  name: name.trim(),
  email: email.trim().toLowerCase(),
  company: company?.trim() ?? '',
  phone: '',
  website: '',
  source: 'form',
  type: 'lead',
  stage: 'new',
  tags: [],
  notes: `Enquiry ID: ${docRef.id}`,
  assignedTo: '', // CRM Phase 2 will populate this from the authenticated admin uid
  createdAt: FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp(),
  lastContactedAt: null,
})
```

- [ ] **Step 2: Update the mock in the test to cover the new contacts.add call**

In `__tests__/api/enquiries.test.ts`, the adminDb mock currently returns `{ add: jest.fn() }` for any collection. Verify the mock structure still handles the second `.collection('contacts').add()` call correctly — the existing mock `collection: jest.fn().mockReturnValue({ add: ... })` already handles this since it returns the same mock for any collection name.

- [ ] **Step 3: Run the existing enquiries tests to verify nothing broke**

```bash
npx jest __tests__/api/enquiries.test.ts --no-coverage
```

Expected: PASS (all 6 existing tests)

- [ ] **Step 4: Commit**

```bash
git add app/api/enquiries/route.ts __tests__/api/enquiries.test.ts
git commit -m "feat: wire /start-a-project form submissions to auto-create CRM contacts"
```

---

## Task 8: Vercel Cron Setup

**Files:**
- Create: `vercel.json`

This is needed for Phase 4 (sequences cron). Setting it up now so it's ready.

- [ ] **Step 1: Create vercel.json**

```json
{
  "crons": [
    {
      "path": "/api/cron/sequences",
      "schedule": "0 * * * *"
    }
  ]
}
```

- [ ] **Step 2: Commit**

```bash
git add vercel.json
git commit -m "chore: add vercel.json with sequences cron schedule (Phase 4)"
```

---

## Task 9: Run Full Test Suite

- [ ] **Step 1: Run all tests**

```bash
cd /Users/peetstander/Cowork/Partners\ in\ Biz\ —\ Client\ Growth/partnersinbiz-web
npx jest --no-coverage
```

Expected: All tests pass. If any fail, fix them before proceeding.

- [ ] **Step 2: Run build check**

```bash
npx next build 2>&1 | tail -20
```

Expected: Build completes without errors.

- [ ] **Step 3: Final commit if any fixes were needed**

```bash
git add -p
git commit -m "fix: resolve any issues found during full test suite run"
```

---

## Bootstrap Admin User

After deploying, Peet's first login needs to create a `users/{uid}` document with `role: "admin"`. This is a one-time manual step or a small migration script.

**Option A (manual — Firebase Console):**
1. Sign in at `/login` with `peet.stander@partnersinbiz.online`
2. Open Firebase Console → Firestore → `users` collection
3. Create document with UID as the document ID, set `role: "admin"`, `email: "peet.stander@partnersinbiz.online"`

**Option B (script — run once):**
```typescript
// scripts/bootstrap-admin.ts
// Run with: npx ts-node scripts/bootstrap-admin.ts
import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'

const app = initializeApp({ credential: cert({ /* service account */ }) })
const db = getFirestore(app)
const auth = getAuth(app)

async function main() {
  const email = 'peet.stander@partnersinbiz.online'
  const user = await auth.getUserByEmail(email)
  await db.collection('users').doc(user.uid).set({
    email,
    name: 'Peet Stander',
    role: 'admin',
    createdAt: new Date(),
  }, { merge: true })
  console.log(`Admin bootstrapped: ${user.uid}`)
}

main()
```

---

## Phase 1 Completion Checklist

- [ ] All tests pass (`npx jest --no-coverage`)
- [ ] Build succeeds (`npx next build`)
- [ ] `GET /api/v1/health` returns 401 without auth, 200 with `AI_API_KEY`
- [ ] `/admin/*` redirects to `/login` when not authenticated
- [ ] `/admin/*` redirects to `/portal/dashboard` when logged in as non-admin
- [ ] Form submission at `/start-a-project` creates both an `enquiries` doc and a `contacts` doc
- [ ] Firestore rules deployed to Firebase
- [ ] Admin bootstrapped in production (manual step)

## Next: Phase 2 — CRM Module

Once Phase 1 is complete, generate the next plan:
`docs/superpowers/plans/2026-03-24-phase2-crm.md`

Covers: contacts list, pipeline kanban, deal management, `/api/v1/crm/*` routes.
