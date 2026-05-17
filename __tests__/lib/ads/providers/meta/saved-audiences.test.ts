import {
  createMetaSavedAudience,
  listMetaSavedAudiences,
  getMetaSavedAudience,
  updateMetaSavedAudience,
  deleteMetaSavedAudience,
} from '@/lib/ads/providers/meta/saved-audiences'
import type { AdSavedAudience, AdTargeting } from '@/lib/ads/types'

const ORIGINAL_FETCH = global.fetch

beforeEach(() => {
  global.fetch = jest.fn() as unknown as typeof fetch
})
afterAll(() => {
  global.fetch = ORIGINAL_FETCH
})

function fakeTs() {
  return { seconds: 1, nanoseconds: 0 } as any
}

function baseTargeting(overrides: Partial<AdTargeting> = {}): AdTargeting {
  return {
    geo: { countries: ['ZA', 'US'] },
    demographics: { ageMin: 25, ageMax: 55 },
    ...overrides,
  }
}

function baseSa(overrides: Partial<AdSavedAudience> = {}): AdSavedAudience {
  return {
    id: 'sa_1',
    orgId: 'org_1',
    platform: 'meta',
    name: 'My Saved Audience',
    description: 'Test audience',
    targeting: baseTargeting(),
    providerData: {},
    createdBy: 'u',
    createdAt: fakeTs(),
    updatedAt: fakeTs(),
    ...overrides,
  }
}

// ─── createMetaSavedAudience ─────────────────────────────────────────────────

describe('createMetaSavedAudience', () => {
  it('POSTs name, description, and targeting JSON to /act_<id>/saved_audiences', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'sa_meta_001' }),
    })
    const r = await createMetaSavedAudience({
      adAccountId: 'act_42',
      accessToken: 'EAAO',
      sa: baseSa(),
    })
    expect(r.metaSavId).toBe('sa_meta_001')
    const call = (global.fetch as jest.Mock).mock.calls[0]
    expect(call[0]).toBe('https://graph.facebook.com/v25.0/act_42/saved_audiences')
    expect(call[1].method).toBe('POST')
    const body = call[1].body as URLSearchParams
    expect(body.get('name')).toBe('My Saved Audience')
    expect(body.get('description')).toBe('Test audience')
    expect(body.get('access_token')).toBe('EAAO')
    const targeting = JSON.parse(body.get('targeting') ?? '{}')
    expect(targeting.geo_locations.countries).toEqual(['ZA', 'US'])
    expect(targeting.age_min).toBe(25)
    expect(targeting.age_max).toBe(55)
  })

  it('strips act_ prefix correctly when caller passes raw numeric id', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'sa_meta_001' }),
    })
    await createMetaSavedAudience({
      adAccountId: '42',
      accessToken: 'EAAO',
      sa: baseSa(),
    })
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe(
      'https://graph.facebook.com/v25.0/act_42/saved_audiences',
    )
  })

  it('includes interests in targeting when present', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'sa_meta_002' }),
    })
    const sa = baseSa({
      targeting: baseTargeting({
        interests: [{ id: 'int_1', name: 'Football' }],
      }),
    })
    await createMetaSavedAudience({ adAccountId: 'act_42', accessToken: 't', sa })
    const body = (global.fetch as jest.Mock).mock.calls[0][1].body as URLSearchParams
    const targeting = JSON.parse(body.get('targeting') ?? '{}')
    expect(targeting.flexible_spec).toBeDefined()
    expect(targeting.flexible_spec[0].interests[0].id).toBe('int_1')
  })

  it('throws on Meta error envelope', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: 'Invalid targeting' } }),
    })
    await expect(
      createMetaSavedAudience({ adAccountId: 'act_1', accessToken: 't', sa: baseSa() }),
    ).rejects.toThrow(/Invalid targeting/)
  })
})

// ─── listMetaSavedAudiences ──────────────────────────────────────────────────

describe('listMetaSavedAudiences', () => {
  it('GETs /act_<id>/saved_audiences with fields and returns data', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [{ id: 'sa_1', name: 'A' }],
      }),
    })
    const r = await listMetaSavedAudiences({ adAccountId: 'act_42', accessToken: 'EAAO' })
    expect(r.data).toHaveLength(1)
    expect(r.data[0].id).toBe('sa_1')
    const url: string = (global.fetch as jest.Mock).mock.calls[0][0]
    expect(url).toContain('act_42/saved_audiences')
    expect(url).toContain('fields=')
  })
})

// ─── getMetaSavedAudience ────────────────────────────────────────────────────

describe('getMetaSavedAudience', () => {
  it('GETs /<sa_id>?fields=...', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'sa_meta_001', name: 'A' }),
    })
    const r = await getMetaSavedAudience({ metaSavId: 'sa_meta_001', accessToken: 't' })
    expect(r.id).toBe('sa_meta_001')
    const url: string = (global.fetch as jest.Mock).mock.calls[0][0]
    expect(url).toContain('/sa_meta_001?')
    expect(url).toContain('fields=')
  })
})

// ─── updateMetaSavedAudience ─────────────────────────────────────────────────

describe('updateMetaSavedAudience', () => {
  it('POSTs name and description to /<sa_id>', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    })
    const r = await updateMetaSavedAudience({
      metaSavId: 'sa_meta_001',
      accessToken: 't',
      patch: { name: 'Renamed', description: 'Updated desc' },
    })
    expect(r.success).toBe(true)
    const body = (global.fetch as jest.Mock).mock.calls[0][1].body as URLSearchParams
    expect(body.get('name')).toBe('Renamed')
    expect(body.get('description')).toBe('Updated desc')
  })

  it('includes targeting JSON when patch.targeting is provided', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    })
    await updateMetaSavedAudience({
      metaSavId: 'sa_meta_001',
      accessToken: 't',
      patch: { targeting: baseTargeting({ geo: { countries: ['GB'] } }) },
    })
    const body = (global.fetch as jest.Mock).mock.calls[0][1].body as URLSearchParams
    const targeting = JSON.parse(body.get('targeting') ?? '{}')
    expect(targeting.geo_locations.countries).toEqual(['GB'])
  })
})

// ─── deleteMetaSavedAudience ─────────────────────────────────────────────────

describe('deleteMetaSavedAudience', () => {
  it('DELETEs /<sa_id>?access_token=', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true })
    await deleteMetaSavedAudience({ metaSavId: 'sa_meta_001', accessToken: 't' })
    const call = (global.fetch as jest.Mock).mock.calls[0]
    expect(call[0]).toContain('/sa_meta_001?access_token=t')
    expect(call[1].method).toBe('DELETE')
  })

  it('throws on non-ok', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ error: { message: 'Audience not found' } }),
    })
    await expect(deleteMetaSavedAudience({ metaSavId: 'bad', accessToken: 't' })).rejects.toThrow(
      /Audience not found/,
    )
  })
})
