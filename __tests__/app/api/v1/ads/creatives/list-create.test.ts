// __tests__/app/api/v1/ads/creatives/list-create.test.ts
import { GET, POST } from '@/app/api/v1/ads/creatives/route'

jest.mock('@/lib/api/auth', () => ({ withAuth: (_r: string, h: any) => h }))
jest.mock('@/lib/ads/creatives/store', () => ({
  listCreatives: jest.fn(),
  createCreative: jest.fn(),
}))
jest.mock('@/lib/ads/ads/store', () => ({
  listAds: jest.fn(),
}))

const store = jest.requireMock('@/lib/ads/creatives/store')
const adsStore = jest.requireMock('@/lib/ads/ads/store')

beforeEach(() => jest.clearAllMocks())

const baseCreative = {
  id: 'crv_1',
  orgId: 'org_1',
  type: 'image',
  name: 'Hero',
  storagePath: 'orgs/org_1/ad_creatives/crv_1/source.jpg',
  sourceUrl: 'https://storage.googleapis.com/bucket/orgs/org_1/ad_creatives/crv_1/source.jpg',
  mimeType: 'image/jpeg',
  fileSize: 250_000,
  status: 'READY',
  platformRefs: {},
}

describe('GET /api/v1/ads/creatives', () => {
  it('returns all creatives for org', async () => {
    store.listCreatives.mockResolvedValueOnce([baseCreative])
    const res = await GET(
      new Request('http://x', { headers: { 'X-Org-Id': 'org_1' } }) as any,
      { uid: 'u1' } as any,
      {} as any,
    )
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data).toHaveLength(1)
    expect(store.listCreatives).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: 'org_1' }),
    )
  })

  it('passes type and status filters', async () => {
    store.listCreatives.mockResolvedValueOnce([])
    await GET(
      new Request('http://x?type=image&status=READY', {
        headers: { 'X-Org-Id': 'org_1' },
      }) as any,
      { uid: 'u1' } as any,
      {} as any,
    )
    expect(store.listCreatives).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'image', status: 'READY' }),
    )
  })

  it('filters by ?used=true — only referenced creatives', async () => {
    const unreferenced = { ...baseCreative, id: 'crv_2' }
    store.listCreatives.mockResolvedValueOnce([baseCreative, unreferenced])
    adsStore.listAds.mockResolvedValueOnce([
      { id: 'ad_1', orgId: 'org_1', creativeIds: ['crv_1'] },
    ])
    const res = await GET(
      new Request('http://x?used=true', { headers: { 'X-Org-Id': 'org_1' } }) as any,
      { uid: 'u1' } as any,
      {} as any,
    )
    const body = await res.json()
    expect(body.data).toHaveLength(1)
    expect(body.data[0].id).toBe('crv_1')
  })

  it('returns 400 when X-Org-Id is missing', async () => {
    const res = await GET(new Request('http://x') as any, { uid: 'u1' } as any, {} as any)
    expect(res.status).toBe(400)
  })
})

describe('POST /api/v1/ads/creatives', () => {
  it('creates creative with status READY on happy path', async () => {
    store.createCreative.mockResolvedValueOnce({ ...baseCreative, status: 'READY' })
    const res = await POST(
      new Request('http://x', {
        method: 'POST',
        headers: { 'X-Org-Id': 'org_1', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'image',
          name: 'Hero',
          sourceUrl: 'https://storage.googleapis.com/bucket/file.jpg',
          storagePath: 'orgs/org_1/ad_creatives/crv_1/source.jpg',
          mimeType: 'image/jpeg',
          fileSize: 250_000,
        }),
      }) as any,
      { uid: 'u1' } as any,
      {} as any,
    )
    const body = await res.json()
    expect(res.status).toBe(201)
    expect(body.success).toBe(true)
    expect(store.createCreative).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({ status: 'READY' }),
      }),
    )
  })

  it('returns 400 when required fields are missing', async () => {
    const res = await POST(
      new Request('http://x', {
        method: 'POST',
        headers: { 'X-Org-Id': 'org_1', 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Hero' }), // missing type, sourceUrl, storagePath, mimeType, fileSize
      }) as any,
      { uid: 'u1' } as any,
      {} as any,
    )
    expect(res.status).toBe(400)
  })

  it('returns 400 when X-Org-Id is missing', async () => {
    const res = await POST(
      new Request('http://x', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }) as any,
      { uid: 'u1' } as any,
      {} as any,
    )
    expect(res.status).toBe(400)
  })
})
