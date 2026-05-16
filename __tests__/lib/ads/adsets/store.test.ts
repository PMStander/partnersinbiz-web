import {
  createAdSet,
  getAdSet,
  listAdSets,
  updateAdSet,
  deleteAdSet,
  setAdSetMetaId,
} from '@/lib/ads/adsets/store'
import type { AdSet } from '@/lib/ads/types'

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

const BASE_TARGETING: AdSet['targeting'] = {
  geo: { countries: ['ZA'] },
  demographics: { ageMin: 25, ageMax: 55 },
}

const BASE_PLACEMENTS: AdSet['placements'] = {
  feeds: true,
  stories: false,
  reels: false,
  marketplace: false,
}

const BASE_INPUT = {
  campaignId: 'cmp_abc123',
  name: 'Test Ad Set',
  status: 'DRAFT' as const,
  optimizationGoal: 'LINK_CLICKS' as const,
  billingEvent: 'IMPRESSIONS' as const,
  targeting: BASE_TARGETING,
  placements: BASE_PLACEMENTS,
}

describe('adsets store', () => {
  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { _docs } = require('@/lib/firebase/admin') as { _docs: Map<string, unknown> }
    _docs.clear()
  })

  it('roundtrips create/get with generated id and defaults', async () => {
    const adSet = await createAdSet({
      orgId: 'org_1',
      input: BASE_INPUT,
    })

    expect(adSet.id).toMatch(/^ads_[0-9a-f]{16}$/)
    expect(adSet.platform).toBe('meta')
    expect(adSet.providerData).toEqual({})
    expect(adSet.orgId).toBe('org_1')
    expect(adSet.campaignId).toBe('cmp_abc123')
    expect(adSet.createdAt).toBeDefined()
    expect(adSet.updatedAt).toBeDefined()

    const fetched = await getAdSet(adSet.id)
    expect(fetched?.id).toBe(adSet.id)
    expect(fetched?.name).toBe('Test Ad Set')
  })

  it('listAdSets filters by orgId and campaignId', async () => {
    await createAdSet({ orgId: 'org_1', input: { ...BASE_INPUT, campaignId: 'cmp_aaa' } })
    await createAdSet({ orgId: 'org_1', input: { ...BASE_INPUT, campaignId: 'cmp_bbb' } })
    await createAdSet({ orgId: 'org_2', input: { ...BASE_INPUT, campaignId: 'cmp_aaa' } })

    const org1CmpAaa = await listAdSets({ orgId: 'org_1', campaignId: 'cmp_aaa' })
    expect(org1CmpAaa).toHaveLength(1)
    expect(org1CmpAaa[0].campaignId).toBe('cmp_aaa')
    expect(org1CmpAaa[0].orgId).toBe('org_1')

    const allOrg1 = await listAdSets({ orgId: 'org_1' })
    expect(allOrg1).toHaveLength(2)
  })

  it('updateAdSet patches fields and bumps updatedAt', async () => {
    const adSet = await createAdSet({ orgId: 'org_1', input: BASE_INPUT })

    await updateAdSet(adSet.id, { name: 'Renamed Ad Set', status: 'ACTIVE' })

    const fetched = await getAdSet(adSet.id)
    expect(fetched?.name).toBe('Renamed Ad Set')
    expect(fetched?.status).toBe('ACTIVE')
    expect(fetched?.updatedAt).toBeDefined()
  })

  it('deleteAdSet removes the doc', async () => {
    const adSet = await createAdSet({ orgId: 'org_1', input: BASE_INPUT })
    await deleteAdSet(adSet.id)
    const fetched = await getAdSet(adSet.id)
    expect(fetched).toBeNull()
  })

  it('setAdSetMetaId merges providerData.meta.id', async () => {
    const adSet = await createAdSet({ orgId: 'org_1', input: BASE_INPUT })

    await setAdSetMetaId(adSet.id, 'meta_adset_777')

    const fetched = await getAdSet(adSet.id)
    expect(fetched?.providerData?.meta?.id).toBe('meta_adset_777')
  })

  it('isolates ad sets by orgId — does not leak across tenants', async () => {
    await createAdSet({ orgId: 'org_1', input: { ...BASE_INPUT, name: 'Org 1 AdSet' } })
    await createAdSet({ orgId: 'org_2', input: { ...BASE_INPUT, name: 'Org 2 AdSet' } })

    const list1 = await listAdSets({ orgId: 'org_1' })
    const list2 = await listAdSets({ orgId: 'org_2' })

    expect(list1).toHaveLength(1)
    expect(list1[0].name).toBe('Org 1 AdSet')
    expect(list2).toHaveLength(1)
    expect(list2[0].name).toBe('Org 2 AdSet')
  })
})
