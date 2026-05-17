// __tests__/api/v1/ads/keywords/keywords.test.ts
// Route-level tests for GET/POST /api/v1/ads/keywords
// and GET/PATCH/DELETE /api/v1/ads/keywords/[id].
// withAuth is stubbed to identity so handlers run directly.

import { NextRequest } from 'next/server'
import { GET, POST } from '@/app/api/v1/ads/keywords/route'
import {
  GET as GET_ONE,
  PATCH,
  DELETE,
} from '@/app/api/v1/ads/keywords/[id]/route'

// withAuth → identity passthrough (mirrors oauth.test.ts pattern)
jest.mock('@/lib/api/auth', () => ({
  withAuth: (_role: string, handler: any) => handler,
}))

// In-memory store mock — shared across route and store module
const docs = new Map<string, Record<string, unknown>>()

function makeQuery(filters: Array<[string, unknown]> = []) {
  return {
    where: (field: string, _op: string, value: unknown) =>
      makeQuery([...filters, [field, value]]),
    get: async () => ({
      docs: Array.from(docs.entries())
        .filter(([k]) => k.startsWith('ad_keywords/'))
        .filter(([, data]) =>
          filters.every(([field, value]) => data[field] === value),
        )
        .map(([, v]) => ({ data: () => v })),
    }),
  }
}

jest.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: (_path: string) => ({
      doc: (id?: string) => {
        const resolvedId = id ?? `kw_${Math.random().toString(36).slice(2)}`
        return {
          id: resolvedId,
          get: async () => ({
            exists: docs.has(`ad_keywords/${resolvedId}`),
            data: () => docs.get(`ad_keywords/${resolvedId}`),
          }),
          set: async (data: Record<string, unknown>) => {
            docs.set(`ad_keywords/${resolvedId}`, { ...data })
          },
          update: async (patch: Record<string, unknown>) => {
            const cur = docs.get(`ad_keywords/${resolvedId}`) ?? {}
            docs.set(`ad_keywords/${resolvedId}`, { ...cur, ...patch })
          },
          delete: async () => {
            docs.delete(`ad_keywords/${resolvedId}`)
          },
        }
      },
      where: (field: string, op: string, value: unknown) =>
        makeQuery([[field, value]]),
    }),
  },
}))

jest.mock('firebase-admin/firestore', () => ({
  Timestamp: {
    now: () => ({ seconds: 1_700_000_000, nanoseconds: 0 }),
  },
  FieldValue: {
    serverTimestamp: () => ({ _serverTimestamp: true }),
  },
}))

// Helper to build a NextRequest with optional JSON body
function makeReq(
  method: string,
  path: string,
  headers: Record<string, string> = {},
  body?: unknown,
) {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
}

// Ctx object passed as third arg for [id] routes
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

const ORG = 'org_test'
const VALID_BODY = {
  campaignId: 'cmp_abc',
  adSetId: 'ads_xyz',
  text: 'running shoes',
  matchType: 'BROAD',
}

beforeEach(() => docs.clear())

// ─── Collection routes ────────────────────────────────────────────────────────

describe('GET /api/v1/ads/keywords', () => {
  it('returns 400 when X-Org-Id header is missing', async () => {
    const res = await GET(makeReq('GET', '/api/v1/ads/keywords'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.success).toBe(false)
    expect(body.error).toMatch(/X-Org-Id/)
  })

  it('returns empty keywords array for org with no keywords', async () => {
    const res = await GET(makeReq('GET', '/api/v1/ads/keywords', { 'X-Org-Id': ORG }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.keywords).toEqual([])
  })
})

describe('POST /api/v1/ads/keywords', () => {
  it('returns 400 when X-Org-Id header is missing', async () => {
    const res = await POST(makeReq('POST', '/api/v1/ads/keywords', {}, VALID_BODY))
    expect(res.status).toBe(400)
  })

  it('returns 400 when campaignId is missing', async () => {
    const res = await POST(
      makeReq('POST', '/api/v1/ads/keywords', { 'X-Org-Id': ORG }, { ...VALID_BODY, campaignId: '' }),
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/campaignId/)
  })

  it('returns 400 when matchType is invalid', async () => {
    const res = await POST(
      makeReq('POST', '/api/v1/ads/keywords', { 'X-Org-Id': ORG }, { ...VALID_BODY, matchType: 'FUZZY' }),
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/matchType/)
  })

  it('returns 400 when text exceeds 80 chars', async () => {
    const res = await POST(
      makeReq('POST', '/api/v1/ads/keywords', { 'X-Org-Id': ORG }, {
        ...VALID_BODY,
        text: 'a'.repeat(81),
      }),
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/80/)
  })

  it('creates a keyword and returns it', async () => {
    const res = await POST(
      makeReq('POST', '/api/v1/ads/keywords', { 'X-Org-Id': ORG }, VALID_BODY),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.keyword).toMatchObject({
      orgId: ORG,
      campaignId: 'cmp_abc',
      adSetId: 'ads_xyz',
      text: 'running shoes',
      matchType: 'BROAD',
      status: 'ACTIVE',
      negativeKeyword: false,
    })
    expect(typeof body.data.keyword.id).toBe('string')
  })
})

// ─── Single-resource routes ───────────────────────────────────────────────────

async function seedKeyword() {
  const res = await POST(
    makeReq('POST', '/api/v1/ads/keywords', { 'X-Org-Id': ORG }, VALID_BODY),
  )
  const body = await res.json()
  return body.data.keyword as { id: string; [k: string]: unknown }
}

describe('GET /api/v1/ads/keywords/[id]', () => {
  it('returns 400 when X-Org-Id is missing', async () => {
    const res = await GET_ONE(makeReq('GET', '/api/v1/ads/keywords/kw_1'), undefined, ctx('kw_1'))
    expect(res.status).toBe(400)
  })

  it('returns 404 for unknown keyword', async () => {
    const res = await GET_ONE(
      makeReq('GET', '/api/v1/ads/keywords/unknown', { 'X-Org-Id': ORG }),
      undefined,
      ctx('unknown'),
    )
    expect(res.status).toBe(404)
  })

  it('returns 404 when keyword belongs to different org', async () => {
    const kw = await seedKeyword()
    const res = await GET_ONE(
      makeReq('GET', `/api/v1/ads/keywords/${kw.id}`, { 'X-Org-Id': 'org_other' }),
      undefined,
      ctx(kw.id),
    )
    expect(res.status).toBe(404)
  })

  it('returns keyword for correct org', async () => {
    const kw = await seedKeyword()
    const res = await GET_ONE(
      makeReq('GET', `/api/v1/ads/keywords/${kw.id}`, { 'X-Org-Id': ORG }),
      undefined,
      ctx(kw.id),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.keyword.id).toBe(kw.id)
    expect(body.data.keyword.text).toBe('running shoes')
  })
})

describe('PATCH /api/v1/ads/keywords/[id]', () => {
  it('returns 404 for unknown keyword', async () => {
    const res = await PATCH(
      makeReq('PATCH', '/api/v1/ads/keywords/nope', { 'X-Org-Id': ORG }, { status: 'PAUSED' }),
      undefined,
      ctx('nope'),
    )
    expect(res.status).toBe(404)
  })

  it('returns 400 when no editable fields supplied', async () => {
    const kw = await seedKeyword()
    const res = await PATCH(
      makeReq('PATCH', `/api/v1/ads/keywords/${kw.id}`, { 'X-Org-Id': ORG }, {}),
      undefined,
      ctx(kw.id),
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/No editable fields/)
  })

  it('returns 400 for invalid status value', async () => {
    const kw = await seedKeyword()
    const res = await PATCH(
      makeReq('PATCH', `/api/v1/ads/keywords/${kw.id}`, { 'X-Org-Id': ORG }, { status: 'DELETED' }),
      undefined,
      ctx(kw.id),
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/status/)
  })

  it('patches status and returns updated keyword', async () => {
    const kw = await seedKeyword()
    const res = await PATCH(
      makeReq('PATCH', `/api/v1/ads/keywords/${kw.id}`, { 'X-Org-Id': ORG }, { status: 'PAUSED' }),
      undefined,
      ctx(kw.id),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.keyword.status).toBe('PAUSED')
  })
})

describe('DELETE /api/v1/ads/keywords/[id]', () => {
  it('returns 404 for unknown keyword', async () => {
    const res = await DELETE(
      makeReq('DELETE', '/api/v1/ads/keywords/ghost', { 'X-Org-Id': ORG }),
      undefined,
      ctx('ghost'),
    )
    expect(res.status).toBe(404)
  })

  it('deletes keyword and returns id', async () => {
    const kw = await seedKeyword()
    const res = await DELETE(
      makeReq('DELETE', `/api/v1/ads/keywords/${kw.id}`, { 'X-Org-Id': ORG }),
      undefined,
      ctx(kw.id),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.id).toBe(kw.id)

    // Verify gone
    const check = await GET_ONE(
      makeReq('GET', `/api/v1/ads/keywords/${kw.id}`, { 'X-Org-Id': ORG }),
      undefined,
      ctx(kw.id),
    )
    expect(check.status).toBe(404)
  })
})
