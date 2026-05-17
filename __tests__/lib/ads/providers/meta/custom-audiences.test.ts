import {
  createMetaCustomAudience,
  listMetaCustomAudiences,
  getMetaCustomAudience,
  updateMetaCustomAudience,
  deleteMetaCustomAudience,
  uploadCustomerListUsers,
} from '@/lib/ads/providers/meta/custom-audiences'
import type { AdCustomAudience } from '@/lib/ads/types'

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

function baseCa(overrides: Partial<AdCustomAudience> = {}): AdCustomAudience {
  return {
    id: 'ca_1',
    orgId: 'org_1',
    platform: 'meta',
    name: 'My Audience',
    description: 'Test description',
    type: 'CUSTOMER_LIST',
    status: 'BUILDING',
    source: {
      kind: 'CUSTOMER_LIST',
      csvStoragePath: 'gs://bucket/file.csv',
      hashCount: 100,
      uploadedAt: fakeTs(),
    },
    providerData: {},
    createdBy: 'u',
    createdAt: fakeTs(),
    updatedAt: fakeTs(),
    ...overrides,
  }
}

// ─── createMetaCustomAudience ────────────────────────────────────────────────

describe('createMetaCustomAudience', () => {
  it('CUSTOMER_LIST: POSTs form body with subtype=CUSTOM and customer_file_source', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'ca_meta_001' }),
    })
    const r = await createMetaCustomAudience({
      adAccountId: 'act_42',
      accessToken: 'EAAO',
      ca: baseCa(),
    })
    expect(r.metaCaId).toBe('ca_meta_001')
    const call = (global.fetch as jest.Mock).mock.calls[0]
    expect(call[0]).toBe('https://graph.facebook.com/v25.0/act_42/customaudiences')
    expect(call[1].method).toBe('POST')
    const body = call[1].body as URLSearchParams
    expect(body.get('name')).toBe('My Audience')
    expect(body.get('subtype')).toBe('CUSTOM')
    expect(body.get('customer_file_source')).toBe('USER_PROVIDED_ONLY')
    expect(body.get('access_token')).toBe('EAAO')
  })

  it('WEBSITE: includes pixel_id, retention_days, rule JSON', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'ca_meta_002' }),
    })
    const ca = baseCa({
      type: 'WEBSITE',
      source: {
        kind: 'WEBSITE',
        pixelId: 'px_123',
        retentionDays: 30,
        rules: [{ op: 'url_contains', value: '/checkout' }],
      },
    })
    const r = await createMetaCustomAudience({
      adAccountId: 'act_42',
      accessToken: 'EAAO',
      ca,
    })
    expect(r.metaCaId).toBe('ca_meta_002')
    const body = (global.fetch as jest.Mock).mock.calls[0][1].body as URLSearchParams
    expect(body.get('subtype')).toBe('WEBSITE')
    expect(body.get('pixel_id')).toBe('px_123')
    expect(body.get('retention_days')).toBe('30')
    const rule = JSON.parse(body.get('rule') ?? '{}')
    expect(rule).toBeDefined()
  })

  it('LOOKALIKE: includes origin_audience_id and lookalike_spec JSON', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'ca_meta_003' }),
    })
    const ca = baseCa({
      type: 'LOOKALIKE',
      source: {
        kind: 'LOOKALIKE',
        sourceAudienceId: 'ca_source_1',
        percent: 5,
        country: 'ZA',
      },
    })
    const r = await createMetaCustomAudience({
      adAccountId: 'act_42',
      accessToken: 'EAAO',
      ca,
      originMetaCaId: 'meta_origin_999',
    } as any)
    expect(r.metaCaId).toBe('ca_meta_003')
    const body = (global.fetch as jest.Mock).mock.calls[0][1].body as URLSearchParams
    expect(body.get('subtype')).toBe('LOOKALIKE')
    expect(body.get('origin_audience_id')).toBe('meta_origin_999')
    const spec = JSON.parse(body.get('lookalike_spec') ?? '{}')
    expect(spec.country).toBe('ZA')
    expect(spec.ratio).toBeCloseTo(0.05)
  })

  it('APP: includes subtype=APP and retention_days', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'ca_meta_004' }),
    })
    const ca = baseCa({
      type: 'APP',
      source: {
        kind: 'APP',
        propertyId: 'prop_1',
        event: 'Purchase',
        retentionDays: 60,
      },
    })
    await createMetaCustomAudience({ adAccountId: 'act_42', accessToken: 'EAAO', ca })
    const body = (global.fetch as jest.Mock).mock.calls[0][1].body as URLSearchParams
    expect(body.get('subtype')).toBe('APP')
    expect(body.get('retention_days')).toBe('60')
  })

  it('ENGAGEMENT: includes subtype=ENGAGEMENT and rule JSON and retention_days', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'ca_meta_005' }),
    })
    const ca = baseCa({
      type: 'ENGAGEMENT',
      source: {
        kind: 'ENGAGEMENT',
        engagementType: 'PAGE',
        sourceObjectId: 'page_123',
        retentionDays: 90,
      },
    })
    await createMetaCustomAudience({ adAccountId: 'act_42', accessToken: 'EAAO', ca })
    const body = (global.fetch as jest.Mock).mock.calls[0][1].body as URLSearchParams
    expect(body.get('subtype')).toBe('ENGAGEMENT')
    expect(body.get('retention_days')).toBe('90')
    const rule = JSON.parse(body.get('rule') ?? '{}')
    expect(rule).toBeDefined()
  })

  it('throws on Meta error envelope', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: 'Bad subtype' } }),
    })
    await expect(
      createMetaCustomAudience({ adAccountId: 'act_1', accessToken: 't', ca: baseCa() }),
    ).rejects.toThrow(/Bad subtype/)
  })
})

// ─── listMetaCustomAudiences ─────────────────────────────────────────────────

describe('listMetaCustomAudiences', () => {
  it('GETs /act_<id>/customaudiences with fields and returns data + nextAfter', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [{ id: 'ca_1', name: 'A', subtype: 'CUSTOM' }],
        paging: { cursors: { after: 'cursor_x' } },
      }),
    })
    const r = await listMetaCustomAudiences({ adAccountId: 'act_42', accessToken: 'EAAO' })
    expect(r.data).toHaveLength(1)
    expect(r.data[0].id).toBe('ca_1')
    expect(r.nextAfter).toBe('cursor_x')
    const url: string = (global.fetch as jest.Mock).mock.calls[0][0]
    expect(url).toContain('act_42/customaudiences')
    expect(url).toContain('fields=')
  })

  it('passes after cursor when provided', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [], paging: {} }),
    })
    await listMetaCustomAudiences({ adAccountId: 'act_42', accessToken: 't', after: 'my_cursor' })
    const url: string = (global.fetch as jest.Mock).mock.calls[0][0]
    expect(url).toContain('after=my_cursor')
  })
})

// ─── getMetaCustomAudience ───────────────────────────────────────────────────

describe('getMetaCustomAudience', () => {
  it('GETs /<ca_id>?fields=...', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'ca_meta_001', name: 'A', subtype: 'CUSTOM' }),
    })
    const r = await getMetaCustomAudience({ metaCaId: 'ca_meta_001', accessToken: 't' })
    expect(r.id).toBe('ca_meta_001')
    const url: string = (global.fetch as jest.Mock).mock.calls[0][0]
    expect(url).toContain('/ca_meta_001?')
    expect(url).toContain('fields=')
  })
})

// ─── updateMetaCustomAudience ────────────────────────────────────────────────

describe('updateMetaCustomAudience', () => {
  it('POSTs name and description to /<ca_id>', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    })
    const r = await updateMetaCustomAudience({
      metaCaId: 'ca_meta_001',
      accessToken: 't',
      patch: { name: 'Renamed', description: 'Updated' },
    })
    expect(r.success).toBe(true)
    const call = (global.fetch as jest.Mock).mock.calls[0]
    expect(call[0]).toContain('/ca_meta_001')
    expect(call[1].method).toBe('POST')
    const body = call[1].body as URLSearchParams
    expect(body.get('name')).toBe('Renamed')
    expect(body.get('description')).toBe('Updated')
  })
})

// ─── deleteMetaCustomAudience ────────────────────────────────────────────────

describe('deleteMetaCustomAudience', () => {
  it('DELETEs /<ca_id>?access_token=', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true })
    await deleteMetaCustomAudience({ metaCaId: 'ca_meta_001', accessToken: 't' })
    const call = (global.fetch as jest.Mock).mock.calls[0]
    expect(call[0]).toContain('/ca_meta_001?access_token=t')
    expect(call[1].method).toBe('DELETE')
  })

  it('throws on non-ok', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ error: { message: 'Not found' } }),
    })
    await expect(deleteMetaCustomAudience({ metaCaId: 'bad', accessToken: 't' })).rejects.toThrow(/Not found/)
  })
})

// ─── uploadCustomerListUsers ─────────────────────────────────────────────────

describe('uploadCustomerListUsers', () => {
  it('POSTs payload JSON with schema and hashed data to /<ca_id>/users', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ num_received: 2, num_invalid_entries: 0 }),
    })
    const r = await uploadCustomerListUsers({
      metaCaId: 'ca_meta_001',
      accessToken: 'EAAO',
      schema: ['EMAIL'],
      hashedRows: [['abc123'], ['def456']],
    })
    expect(r.success).toBe(true)
    expect(r.numReceived).toBe(2)
    const call = (global.fetch as jest.Mock).mock.calls[0]
    expect(call[0]).toContain('/ca_meta_001/users')
    expect(call[1].method).toBe('POST')
    const body = call[1].body as URLSearchParams
    const payload = JSON.parse(body.get('payload') ?? '{}')
    expect(payload.schema).toEqual(['EMAIL'])
    expect(payload.data).toEqual([['abc123'], ['def456']])
  })
})
