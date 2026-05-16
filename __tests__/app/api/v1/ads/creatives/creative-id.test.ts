// __tests__/app/api/v1/ads/creatives/creative-id.test.ts
import { GET, PATCH, DELETE } from '@/app/api/v1/ads/creatives/[id]/route'

jest.mock('@/lib/api/auth', () => ({ withAuth: (_r: string, h: any) => h }))
jest.mock('@/lib/ads/creatives/store', () => ({
  getCreative: jest.fn(),
  updateCreative: jest.fn(),
  archiveCreative: jest.fn(),
}))

const store = jest.requireMock('@/lib/ads/creatives/store')

beforeEach(() => jest.clearAllMocks())

const baseCreative = {
  id: 'crv_1',
  orgId: 'org_1',
  type: 'image',
  name: 'Hero',
  storagePath: 'orgs/org_1/ad_creatives/crv_1/source.jpg',
  sourceUrl: 'https://storage.googleapis.com/bucket/file.jpg',
  mimeType: 'image/jpeg',
  fileSize: 250_000,
  status: 'READY',
  platformRefs: {},
}

function makeReq(orgId = 'org_1', extra?: RequestInit) {
  return new Request('http://x', { headers: { 'X-Org-Id': orgId }, ...extra }) as any
}

describe('GET /api/v1/ads/creatives/[id]', () => {
  it('returns creative for correct org', async () => {
    store.getCreative.mockResolvedValueOnce(baseCreative)
    const res = await GET(makeReq(), {} as any, { params: Promise.resolve({ id: 'crv_1' }) })
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.data.id).toBe('crv_1')
  })

  it('returns 404 when creative belongs to different org (tenant isolation)', async () => {
    store.getCreative.mockResolvedValueOnce({ ...baseCreative, orgId: 'org_other' })
    const res = await GET(makeReq('org_1'), {} as any, { params: Promise.resolve({ id: 'crv_1' }) })
    expect(res.status).toBe(404)
  })
})

describe('PATCH /api/v1/ads/creatives/[id]', () => {
  it('updates name and returns updated doc', async () => {
    const updated = { ...baseCreative, name: 'Updated Hero' }
    store.getCreative
      .mockResolvedValueOnce(baseCreative) // initial fetch
      .mockResolvedValueOnce(updated) // post-update fetch
    store.updateCreative.mockResolvedValueOnce(undefined)

    const res = await PATCH(
      new Request('http://x', {
        method: 'PATCH',
        headers: { 'X-Org-Id': 'org_1', 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated Hero' }),
      }) as any,
      {} as any,
      { params: Promise.resolve({ id: 'crv_1' }) },
    )
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.data.name).toBe('Updated Hero')
    expect(store.updateCreative).toHaveBeenCalledWith('crv_1', { name: 'Updated Hero' })
  })

  it('returns 404 when creative belongs to different org', async () => {
    store.getCreative.mockResolvedValueOnce({ ...baseCreative, orgId: 'org_other' })
    const res = await PATCH(
      new Request('http://x', {
        method: 'PATCH',
        headers: { 'X-Org-Id': 'org_1', 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'X' }),
      }) as any,
      {} as any,
      { params: Promise.resolve({ id: 'crv_1' }) },
    )
    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/v1/ads/creatives/[id]', () => {
  it('archives creative and returns {archived: true}', async () => {
    store.getCreative.mockResolvedValueOnce(baseCreative)
    store.archiveCreative.mockResolvedValueOnce(undefined)
    const res = await DELETE(makeReq(), {} as any, { params: Promise.resolve({ id: 'crv_1' }) })
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.data.archived).toBe(true)
    expect(store.archiveCreative).toHaveBeenCalledWith('crv_1')
  })

  it('returns 404 when creative belongs to different org', async () => {
    store.getCreative.mockResolvedValueOnce({ ...baseCreative, orgId: 'org_other' })
    const res = await DELETE(makeReq('org_1'), {} as any, { params: Promise.resolve({ id: 'crv_1' }) })
    expect(res.status).toBe(404)
  })
})
