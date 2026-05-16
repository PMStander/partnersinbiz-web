import {
  createAd,
  getAd,
  listAds,
  updateAd,
  deleteAd,
  setAdMetaIds,
} from '@/lib/ads/ads/store'

// Mock the firebase admin module to avoid live Firestore in tests
jest.mock('@/lib/firebase/admin', () => {
  const docs = new Map<string, Record<string, unknown>>()

  function makeQuery(path: string, filters: Array<[string, string, unknown]> = []) {
    return {
      where: (field: string, op: string, value: unknown) =>
        makeQuery(path, [...filters, [field, op, value]]),
      orderBy: (_field: string, _dir?: string) => makeQuery(path, filters),
      get: async () => ({
        docs: Array.from(docs.entries())
          .filter(([k]) => k.startsWith(`${path}/`))
          .filter(([, data]) =>
            filters.every(([field, op, value]) => {
              if (op !== '==') return true
              return (data as Record<string, unknown>)[field] === value
            }),
          )
          .map(([k, v]) => ({ id: k.replace(`${path}/`, ''), data: () => v })),
      }),
    }
  }

  const collection = (path: string) => ({
    doc: (id: string) => ({
      get: async () => ({
        exists: docs.has(`${path}/${id}`),
        id,
        data: () => docs.get(`${path}/${id}`),
      }),
      set: async (data: Record<string, unknown>) => {
        docs.set(`${path}/${id}`, { ...data })
      },
      update: async (patch: Record<string, unknown>) => {
        const cur = docs.get(`${path}/${id}`) ?? {}
        docs.set(`${path}/${id}`, { ...cur, ...patch })
      },
      delete: async () => {
        docs.delete(`${path}/${id}`)
      },
    }),
    where: (field: string, op: string, value: unknown) => makeQuery(path, [[field, op, value]]),
  })

  return {
    adminDb: { collection },
    _docs: docs,
  }
})

const BASE_INPUT = {
  adSetId: 'ads_xyz',
  campaignId: 'cmp_abc',
  name: 'Test Ad',
  status: 'DRAFT' as const,
  format: 'SINGLE_IMAGE' as const,
  creativeIds: [] as string[],
  copy: {
    primaryText: 'Grow your business today',
    headline: 'Get Started',
    callToAction: 'LEARN_MORE' as const,
    destinationUrl: 'https://example.com',
  },
}

describe('ads store', () => {
  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { _docs } = require('@/lib/firebase/admin') as { _docs: Map<string, unknown> }
    _docs.clear()
  })

  it('roundtrips create/get with generated id and defaults', async () => {
    const ad = await createAd({
      orgId: 'org_1',
      input: BASE_INPUT,
    })

    expect(ad.id).toMatch(/^ad_[0-9a-f]{16}$/)
    expect(ad.platform).toBe('meta')
    expect(ad.providerData).toEqual({})
    expect(ad.orgId).toBe('org_1')
    expect(ad.adSetId).toBe('ads_xyz')
    expect(ad.campaignId).toBe('cmp_abc')
    expect(ad.createdAt).toBeDefined()
    expect(ad.updatedAt).toBeDefined()

    const fetched = await getAd(ad.id)
    expect(fetched?.id).toBe(ad.id)
    expect(fetched?.name).toBe('Test Ad')
  })

  it('listAds filters by orgId + adSetId', async () => {
    await createAd({ orgId: 'org_1', input: { ...BASE_INPUT, adSetId: 'ads_aaa' } })
    await createAd({ orgId: 'org_1', input: { ...BASE_INPUT, adSetId: 'ads_bbb' } })
    await createAd({ orgId: 'org_2', input: { ...BASE_INPUT, adSetId: 'ads_aaa' } })

    const org1AdsAaa = await listAds({ orgId: 'org_1', adSetId: 'ads_aaa' })
    expect(org1AdsAaa).toHaveLength(1)
    expect(org1AdsAaa[0].adSetId).toBe('ads_aaa')
    expect(org1AdsAaa[0].orgId).toBe('org_1')

    const allOrg1 = await listAds({ orgId: 'org_1' })
    expect(allOrg1).toHaveLength(2)
  })

  it('listAds filters by orgId + campaignId', async () => {
    await createAd({ orgId: 'org_1', input: { ...BASE_INPUT, campaignId: 'cmp_111' } })
    await createAd({ orgId: 'org_1', input: { ...BASE_INPUT, campaignId: 'cmp_222' } })

    const cmp111Ads = await listAds({ orgId: 'org_1', campaignId: 'cmp_111' })
    expect(cmp111Ads).toHaveLength(1)
    expect(cmp111Ads[0].campaignId).toBe('cmp_111')
  })

  it('updateAd patches fields and bumps updatedAt', async () => {
    const ad = await createAd({ orgId: 'org_1', input: BASE_INPUT })

    await updateAd(ad.id, { name: 'Renamed Ad', status: 'ACTIVE' })

    const fetched = await getAd(ad.id)
    expect(fetched?.name).toBe('Renamed Ad')
    expect(fetched?.status).toBe('ACTIVE')
    expect(fetched?.updatedAt).toBeDefined()
  })

  it('deleteAd removes the doc', async () => {
    const ad = await createAd({ orgId: 'org_1', input: BASE_INPUT })
    await deleteAd(ad.id)
    const fetched = await getAd(ad.id)
    expect(fetched).toBeNull()
  })

  it('setAdMetaIds merges both providerData.meta ids', async () => {
    const ad = await createAd({ orgId: 'org_1', input: BASE_INPUT })

    await setAdMetaIds(ad.id, { metaAdId: 'meta_ad_555', metaCreativeId: 'meta_cre_888' })

    const fetched = await getAd(ad.id)
    expect(fetched?.providerData?.meta?.adId).toBe('meta_ad_555')
    expect(fetched?.providerData?.meta?.creativeId).toBe('meta_cre_888')
  })

  it('isolates ads by orgId — does not leak across tenants', async () => {
    await createAd({ orgId: 'org_1', input: { ...BASE_INPUT, name: 'Org 1 Ad' } })
    await createAd({ orgId: 'org_2', input: { ...BASE_INPUT, name: 'Org 2 Ad' } })

    const list1 = await listAds({ orgId: 'org_1' })
    const list2 = await listAds({ orgId: 'org_2' })

    expect(list1).toHaveLength(1)
    expect(list1[0].name).toBe('Org 1 Ad')
    expect(list2).toHaveLength(1)
    expect(list2[0].name).toBe('Org 2 Ad')
  })
})
