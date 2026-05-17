// __tests__/app/api/v1/ads/saved-audiences/sa-id.test.ts
import { GET, PATCH, DELETE } from '@/app/api/v1/ads/saved-audiences/[id]/route'

jest.mock('@/lib/api/auth', () => ({ withAuth: (_r: string, h: any) => h }))
jest.mock('@/lib/ads/saved-audiences/store', () => ({
  getSavedAudience: jest.fn(),
  updateSavedAudience: jest.fn(),
  deleteSavedAudience: jest.fn(),
}))
jest.mock('@/lib/ads/api-helpers', () => ({
  requireMetaContext: jest.fn(),
}))
jest.mock('@/lib/ads/providers/meta', () => ({
  metaProvider: {
    savedAudienceCRUD: jest.fn(),
  },
}))
jest.mock('@/lib/ads/providers/meta/saved-audiences', () => ({
  deleteMetaSavedAudience: jest.fn(),
}))

const store = jest.requireMock('@/lib/ads/saved-audiences/store')
const helpers = jest.requireMock('@/lib/ads/api-helpers')
const metaMock = jest.requireMock('@/lib/ads/providers/meta')
const metaSAMod = jest.requireMock('@/lib/ads/providers/meta/saved-audiences')

beforeEach(() => jest.clearAllMocks())

const baseSA = {
  id: 'sav_1',
  orgId: 'org_1',
  name: 'My Saved Audience',
  platform: 'meta',
  targeting: { age_min: 25, age_max: 45 },
  providerData: { meta: { savedAudienceId: 'meta_sav_1' } },
}

const baseCtx = {
  orgId: 'org_1',
  accessToken: 'tok',
  adAccountId: 'act_42',
  connection: { id: 'conn_1' },
}

function makeReq(orgId = 'org_1', extra?: RequestInit) {
  return new Request('http://x', { headers: { 'X-Org-Id': orgId }, ...extra }) as any
}

describe('GET /api/v1/ads/saved-audiences/[id]', () => {
  it('returns the saved audience for the correct org', async () => {
    store.getSavedAudience.mockResolvedValueOnce(baseSA)
    const res = await GET(makeReq(), {} as any, { params: Promise.resolve({ id: 'sav_1' }) })
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.data.id).toBe('sav_1')
  })

  it('returns 404 for wrong org (tenant isolation)', async () => {
    store.getSavedAudience.mockResolvedValueOnce({ ...baseSA, orgId: 'org_other' })
    const res = await GET(makeReq('org_1'), {} as any, { params: Promise.resolve({ id: 'sav_1' }) })
    expect(res.status).toBe(404)
  })

  it('returns 404 when saved audience does not exist', async () => {
    store.getSavedAudience.mockResolvedValueOnce(null)
    const res = await GET(makeReq(), {} as any, { params: Promise.resolve({ id: 'sav_missing' }) })
    expect(res.status).toBe(404)
  })

  it('returns 400 when X-Org-Id is missing', async () => {
    const res = await GET(
      new Request('http://x') as any,
      {} as any,
      { params: Promise.resolve({ id: 'sav_1' }) },
    )
    expect(res.status).toBe(400)
  })
})

describe('PATCH /api/v1/ads/saved-audiences/[id]', () => {
  it('updates saved audience and returns updated doc', async () => {
    const updated = { ...baseSA, name: 'Updated Audience' }
    store.getSavedAudience
      .mockResolvedValueOnce(baseSA) // initial fetch
      .mockResolvedValueOnce(updated) // post-update fetch
    store.updateSavedAudience.mockResolvedValueOnce(undefined)
    helpers.requireMetaContext.mockResolvedValueOnce(baseCtx)
    metaMock.metaProvider.savedAudienceCRUD.mockResolvedValueOnce({ success: true })

    const res = await PATCH(
      new Request('http://x', {
        method: 'PATCH',
        headers: { 'X-Org-Id': 'org_1', 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated Audience' }),
      }) as any,
      {} as any,
      { params: Promise.resolve({ id: 'sav_1' }) },
    )
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.data.name).toBe('Updated Audience')
    expect(store.updateSavedAudience).toHaveBeenCalledWith('sav_1', { name: 'Updated Audience' })
    expect(metaMock.metaProvider.savedAudienceCRUD).toHaveBeenCalledWith(
      expect.objectContaining({ op: 'update', metaSavId: 'meta_sav_1' }),
    )
  })

  it('returns 404 when saved audience belongs to different org', async () => {
    store.getSavedAudience.mockResolvedValueOnce({ ...baseSA, orgId: 'org_other' })
    const res = await PATCH(
      new Request('http://x', {
        method: 'PATCH',
        headers: { 'X-Org-Id': 'org_1', 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'X' }),
      }) as any,
      {} as any,
      { params: Promise.resolve({ id: 'sav_1' }) },
    )
    expect(res.status).toBe(404)
  })

  it('succeeds even when Meta PATCH fails (warning swallowed)', async () => {
    const updated = { ...baseSA, name: 'Updated Name' }
    store.getSavedAudience
      .mockResolvedValueOnce(baseSA)
      .mockResolvedValueOnce(updated)
    store.updateSavedAudience.mockResolvedValueOnce(undefined)
    helpers.requireMetaContext.mockResolvedValueOnce(baseCtx)
    metaMock.metaProvider.savedAudienceCRUD.mockRejectedValueOnce(new Error('Meta PATCH error'))

    const res = await PATCH(
      new Request('http://x', {
        method: 'PATCH',
        headers: { 'X-Org-Id': 'org_1', 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated Name' }),
      }) as any,
      {} as any,
      { params: Promise.resolve({ id: 'sav_1' }) },
    )
    expect(res.status).toBe(200)
  })
})

describe('DELETE /api/v1/ads/saved-audiences/[id]', () => {
  it('does best-effort Meta delete then deletes locally', async () => {
    store.getSavedAudience.mockResolvedValueOnce(baseSA)
    helpers.requireMetaContext.mockResolvedValueOnce(baseCtx)
    metaSAMod.deleteMetaSavedAudience.mockResolvedValueOnce({ success: true })
    store.deleteSavedAudience.mockResolvedValueOnce(undefined)

    const res = await DELETE(makeReq(), {} as any, { params: Promise.resolve({ id: 'sav_1' }) })
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.data.deleted).toBe(true)
    expect(metaSAMod.deleteMetaSavedAudience).toHaveBeenCalledWith(
      expect.objectContaining({ metaSavId: 'meta_sav_1' }),
    )
    expect(store.deleteSavedAudience).toHaveBeenCalledWith('sav_1')
  })

  it('deletes locally even when no metaSavId is set', async () => {
    const saWithoutMeta = { ...baseSA, providerData: { meta: {} } }
    store.getSavedAudience.mockResolvedValueOnce(saWithoutMeta)
    store.deleteSavedAudience.mockResolvedValueOnce(undefined)

    const res = await DELETE(makeReq(), {} as any, { params: Promise.resolve({ id: 'sav_1' }) })
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.data.deleted).toBe(true)
    expect(metaSAMod.deleteMetaSavedAudience).not.toHaveBeenCalled()
    expect(store.deleteSavedAudience).toHaveBeenCalledWith('sav_1')
  })

  it('returns 404 when saved audience belongs to different org', async () => {
    store.getSavedAudience.mockResolvedValueOnce({ ...baseSA, orgId: 'org_other' })
    const res = await DELETE(makeReq('org_1'), {} as any, { params: Promise.resolve({ id: 'sav_1' }) })
    expect(res.status).toBe(404)
  })

  it('still deletes locally even when Meta delete throws', async () => {
    store.getSavedAudience.mockResolvedValueOnce(baseSA)
    helpers.requireMetaContext.mockResolvedValueOnce(baseCtx)
    metaSAMod.deleteMetaSavedAudience.mockRejectedValueOnce(new Error('Meta error'))
    store.deleteSavedAudience.mockResolvedValueOnce(undefined)

    const res = await DELETE(makeReq(), {} as any, { params: Promise.resolve({ id: 'sav_1' }) })
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.data.deleted).toBe(true)
    expect(store.deleteSavedAudience).toHaveBeenCalledWith('sav_1')
  })
})
