// __tests__/api/v1/properties/[id]/config.test.ts
import { GET } from '@/app/api/v1/properties/[id]/config/route'
import { NextRequest } from 'next/server'

jest.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: jest.fn() },
}))

import { adminDb } from '@/lib/firebase/admin'

const CTX = { params: Promise.resolve({ id: 'prop-123' }) }
const INGEST_KEY = 'a'.repeat(64)

const storedDoc = {
  orgId: 'org-lumen',
  name: 'Scrolled Brain',
  status: 'active',
  deleted: false,
  ingestKey: INGEST_KEY,
  config: {
    appStoreUrl: 'https://apps.apple.com/app/id123',
    killSwitch: false,
    featureFlags: { cardStyle: 'meme' },
  },
}

function mockDoc(data?: object | null) {
  ;(adminDb.collection as jest.Mock).mockReturnValue({
    doc: jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue(
        data
          ? { exists: true, id: 'prop-123', data: () => data }
          : { exists: false },
      ),
    }),
  })
}

function makeReq(ingestKey?: string) {
  return new NextRequest('http://localhost/api/v1/properties/prop-123/config', {
    headers: ingestKey ? { 'x-pib-ingest-key': ingestKey } : {},
  })
}

describe('GET /api/v1/properties/:id/config', () => {
  it('returns 401 when ingest key is missing', async () => {
    mockDoc(storedDoc)
    const res = await GET(makeReq(), CTX)
    expect(res.status).toBe(401)
  })

  it('returns 401 when ingest key is wrong', async () => {
    mockDoc(storedDoc)
    const res = await GET(makeReq('b'.repeat(64)), CTX)
    expect(res.status).toBe(401)
  })

  it('returns 404 when property not found', async () => {
    mockDoc(null)
    const res = await GET(makeReq(INGEST_KEY), CTX)
    expect(res.status).toBe(404)
  })

  it('returns 503 when kill switch is active', async () => {
    mockDoc({ ...storedDoc, config: { killSwitch: true } })
    const res = await GET(makeReq(INGEST_KEY), CTX)
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.killSwitch).toBe(true)
  })

  it('returns config with cache headers when all is valid', async () => {
    mockDoc(storedDoc)
    const res = await GET(makeReq(INGEST_KEY), CTX)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.appStoreUrl).toBe('https://apps.apple.com/app/id123')
    expect(body.featureFlags?.cardStyle).toBe('meme')
    expect(res.headers.get('Cache-Control')).toContain('s-maxage=60')
  })

  it('does not expose ingestKey or internal fields in the response', async () => {
    mockDoc(storedDoc)
    const res = await GET(makeReq(INGEST_KEY), CTX)
    const body = await res.json()
    expect(body.ingestKey).toBeUndefined()
    expect(body.orgId).toBeUndefined()
    expect(body.deleted).toBeUndefined()
  })
})
