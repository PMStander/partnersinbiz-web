// __tests__/app/api/v1/ads/custom-audiences/sync-platform.test.ts
import { POST } from '@/app/api/v1/ads/custom-audiences/[id]/sync/[platform]/route'

jest.mock('@/lib/api/auth', () => ({ withAuth: (_r: string, h: any) => h }))
jest.mock('@/lib/ads/custom-audiences/store', () => ({
  getCustomAudience: jest.fn(),
  setCustomAudienceMetaId: jest.fn(),
}))
jest.mock('@/lib/ads/api-helpers', () => ({
  requireMetaContext: jest.fn(),
}))
jest.mock('@/lib/ads/providers/meta', () => ({
  metaProvider: {
    customAudienceCRUD: jest.fn(),
  },
}))
jest.mock('@/lib/ads/types', () => {
  const actual = jest.requireActual('@/lib/ads/types')
  return {
    ...actual,
    isAdPlatform: jest.fn((v: unknown) =>
      ['meta', 'google', 'linkedin', 'tiktok'].includes(String(v)),
    ),
  }
})

const store = jest.requireMock('@/lib/ads/custom-audiences/store')
const helpers = jest.requireMock('@/lib/ads/api-helpers')
const metaMock = jest.requireMock('@/lib/ads/providers/meta')

beforeEach(() => jest.clearAllMocks())

const baseCA = {
  id: 'ca_1',
  orgId: 'org_1',
  name: 'My Audience',
  type: 'CUSTOMER_LIST',
  status: 'BUILDING',
  platform: 'meta',
  providerData: { meta: {} }, // no metaCaId yet — triggers create path
}

const baseCtx = {
  orgId: 'org_1',
  accessToken: 'tok',
  adAccountId: 'act_42',
  connection: { id: 'conn_1' },
}

function makeReq(orgId = 'org_1') {
  return new Request('http://x', { method: 'POST', headers: { 'X-Org-Id': orgId } }) as any
}

describe('POST /api/v1/ads/custom-audiences/[id]/sync/[platform]', () => {
  it('meta: creates audience on Meta when no metaCaId (alreadySynced=false)', async () => {
    store.getCustomAudience.mockResolvedValueOnce(baseCA)
    helpers.requireMetaContext.mockResolvedValueOnce(baseCtx)
    metaMock.metaProvider.customAudienceCRUD.mockResolvedValueOnce({ metaCaId: 'meta_ca_new' })
    store.setCustomAudienceMetaId.mockResolvedValueOnce(undefined)

    const res = await POST(
      makeReq(),
      {} as any,
      { params: Promise.resolve({ id: 'ca_1', platform: 'meta' }) },
    )
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.platform).toBe('meta')
    expect(body.data.metaCaId).toBe('meta_ca_new')
    expect(body.data.alreadySynced).toBe(false)
    expect(metaMock.metaProvider.customAudienceCRUD).toHaveBeenCalledWith(
      expect.objectContaining({ op: 'create' }),
    )
  })

  it('meta: updates name/description on Meta when metaCaId already exists (alreadySynced=true)', async () => {
    const caWithMeta = { ...baseCA, providerData: { meta: { customAudienceId: 'meta_ca_existing' } } }
    store.getCustomAudience.mockResolvedValueOnce(caWithMeta)
    helpers.requireMetaContext.mockResolvedValueOnce(baseCtx)
    metaMock.metaProvider.customAudienceCRUD.mockResolvedValueOnce({ success: true })

    const res = await POST(
      makeReq(),
      {} as any,
      { params: Promise.resolve({ id: 'ca_1', platform: 'meta' }) },
    )
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.data.platform).toBe('meta')
    expect(body.data.metaCaId).toBe('meta_ca_existing')
    expect(body.data.alreadySynced).toBe(true)
    expect(metaMock.metaProvider.customAudienceCRUD).toHaveBeenCalledWith(
      expect.objectContaining({ op: 'update', metaCaId: 'meta_ca_existing' }),
    )
  })

  it('google platform → 501 not implemented', async () => {
    store.getCustomAudience.mockResolvedValueOnce(baseCA)

    const res = await POST(
      makeReq(),
      {} as any,
      { params: Promise.resolve({ id: 'ca_1', platform: 'google' }) },
    )
    expect(res.status).toBe(501)
  })

  it('returns 404 when audience belongs to different org', async () => {
    store.getCustomAudience.mockResolvedValueOnce({ ...baseCA, orgId: 'org_other' })

    const res = await POST(
      makeReq('org_1'),
      {} as any,
      { params: Promise.resolve({ id: 'ca_1', platform: 'meta' }) },
    )
    expect(res.status).toBe(404)
  })
})
