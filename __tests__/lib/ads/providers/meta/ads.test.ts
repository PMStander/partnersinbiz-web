import {
  createAd,
  listAds,
  getAd,
  updateAd,
  deleteAd,
  validateAd,
} from '@/lib/ads/providers/meta/ads'
import type { Ad } from '@/lib/ads/types'

// Mock image-upload so tests don't hit real network
jest.mock('@/lib/ads/providers/meta/image-upload', () => ({
  uploadImageFromUrl: jest.fn(),
}))

import { uploadImageFromUrl } from '@/lib/ads/providers/meta/image-upload'

const ORIGINAL_FETCH = global.fetch

beforeEach(() => {
  global.fetch = jest.fn() as unknown as typeof fetch
  ;(uploadImageFromUrl as jest.Mock).mockReset()
})
afterAll(() => {
  global.fetch = ORIGINAL_FETCH
})

function fakeAd(overrides?: Partial<Ad>): Ad {
  return {
    id: 'ad_1',
    orgId: 'org_1',
    adSetId: 'as_1',
    campaignId: 'cmp_1',
    platform: 'meta',
    name: 'Smoke Test Ad',
    status: 'PAUSED',
    format: 'SINGLE_IMAGE',
    creativeIds: [],
    inlineImageUrl: 'https://cdn.example.com/img.jpg',
    copy: {
      primaryText: 'Primary copy',
      headline: 'Headline text',
      description: 'Description',
      callToAction: 'LEARN_MORE',
      destinationUrl: 'https://example.com',
    },
    providerData: {},
    createdAt: { seconds: 1, nanoseconds: 0 } as any,
    updatedAt: { seconds: 1, nanoseconds: 0 } as any,
    ...overrides,
  }
}

describe('createAd', () => {
  it('uploads image, POSTs adcreative, POSTs ad, returns both IDs in order', async () => {
    ;(uploadImageFromUrl as jest.Mock).mockResolvedValueOnce('img_hash_abc')
    // First fetch call = POST /adcreatives
    ;(global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'creative_999' }),
      })
      // Second fetch call = POST /ads
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'ad_999' }),
      })

    const r = await createAd({
      adAccountId: 'act_42',
      accessToken: 'EAAO',
      ad: fakeAd(),
      metaAdSetId: 'meta_as_123',
      pageId: 'page_456',
    })

    expect(r.metaAdId).toBe('ad_999')
    expect(r.metaCreativeId).toBe('creative_999')

    // image upload should have been called
    expect(uploadImageFromUrl).toHaveBeenCalledWith({
      adAccountId: 'act_42',
      accessToken: 'EAAO',
      sourceUrl: 'https://cdn.example.com/img.jpg',
    })

    // first fetch = adcreatives
    const creativeCall = (global.fetch as jest.Mock).mock.calls[0]
    expect(creativeCall[0]).toBe('https://graph.facebook.com/v25.0/act_42/adcreatives')
    expect(creativeCall[1].method).toBe('POST')
    const creativeBody = creativeCall[1].body as URLSearchParams
    expect(creativeBody.get('name')).toBe('Smoke Test Ad')
    const spec = JSON.parse(creativeBody.get('object_story_spec')!)
    expect(spec.page_id).toBe('page_456')
    expect(spec.link_data.image_hash).toBe('img_hash_abc')

    // second fetch = ads
    const adCall = (global.fetch as jest.Mock).mock.calls[1]
    expect(adCall[0]).toBe('https://graph.facebook.com/v25.0/act_42/ads')
    const adBody = adCall[1].body as URLSearchParams
    expect(adBody.get('name')).toBe('Smoke Test Ad')
    expect(adBody.get('adset_id')).toBe('meta_as_123')
    expect(JSON.parse(adBody.get('creative')!).creative_id).toBe('creative_999')
    expect(adBody.get('status')).toBe('PAUSED')
  })

  it('uploads each CAROUSEL image separately and assembles child_attachments', async () => {
    ;(uploadImageFromUrl as jest.Mock)
      .mockResolvedValueOnce('hash_1')
      .mockResolvedValueOnce('hash_2')
    ;(global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'c1' }) }) // adcreatives
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'ad1' }) }) // ads

    const carouselAd = fakeAd({
      format: 'CAROUSEL',
      inlineImageUrl: undefined,
      inlineCarouselUrls: ['https://cdn.example.com/a.jpg', 'https://cdn.example.com/b.jpg'],
    })

    const r = await createAd({
      adAccountId: 'act_42',
      accessToken: 'EAAO',
      ad: carouselAd,
      metaAdSetId: 'as_1',
      pageId: 'page_1',
    })

    expect(uploadImageFromUrl).toHaveBeenCalledTimes(2)
    expect(r.metaCreativeId).toBe('c1')
    const creativeBody = (global.fetch as jest.Mock).mock.calls[0][1].body as URLSearchParams
    const spec = JSON.parse(creativeBody.get('object_story_spec')!)
    expect(spec.link_data.child_attachments).toHaveLength(2)
    expect(spec.link_data.child_attachments[0].image_hash).toBe('hash_1')
    expect(spec.link_data.child_attachments[1].image_hash).toBe('hash_2')
  })

  it('throws on adcreatives API error', async () => {
    ;(uploadImageFromUrl as jest.Mock).mockResolvedValueOnce('hash_x')
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: 'Creative error' } }),
    })
    await expect(
      createAd({
        adAccountId: 'act_1',
        accessToken: 't',
        ad: fakeAd(),
        metaAdSetId: 'as1',
        pageId: 'p1',
      }),
    ).rejects.toThrow(/Creative error/)
  })
})

describe('listAds', () => {
  it('GETs /<adSetId>/ads when adSetId is provided', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [{ id: 'ad1', name: 'A', adset_id: 'as1', status: 'ACTIVE' }],
        paging: { cursors: { after: 'next_cur' } },
      }),
    })
    const r = await listAds({ adSetId: 'as_123', accessToken: 't' })
    expect(r.data).toHaveLength(1)
    expect(r.nextAfter).toBe('next_cur')
    const url = (global.fetch as jest.Mock).mock.calls[0][0]
    expect(url).toContain('as_123/ads')
  })

  it('GETs /act_<id>/ads when only adAccountId is provided', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [], paging: {} }),
    })
    await listAds({ adAccountId: 'act_42', accessToken: 't' })
    const url = (global.fetch as jest.Mock).mock.calls[0][0]
    expect(url).toContain('act_42/ads')
  })
})

describe('getAd', () => {
  it('GETs /<id> with fields', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'ad_999', name: 'X', adset_id: 'as1', status: 'ACTIVE' }),
    })
    const r = await getAd({ metaAdId: 'ad_999', accessToken: 't' })
    expect(r.id).toBe('ad_999')
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toContain('/ad_999?')
  })
})

describe('updateAd', () => {
  it('POSTs name + status subset and returns success', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    })
    const r = await updateAd({
      metaAdId: 'ad_999',
      accessToken: 't',
      patch: { name: 'Renamed Ad', status: 'ACTIVE' },
    })
    expect(r.success).toBe(true)
    const body = (global.fetch as jest.Mock).mock.calls[0][1].body as URLSearchParams
    expect(body.get('name')).toBe('Renamed Ad')
    expect(body.get('status')).toBe('ACTIVE')
    expect(body.get('execution_options')).toBeNull()
  })

  it('adds execution_options=["VALIDATE"] when validateOnly=true', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    })
    await updateAd({
      metaAdId: 'ad1',
      accessToken: 't',
      patch: { name: 'X' },
      validateOnly: true,
    })
    const body = (global.fetch as jest.Mock).mock.calls[0][1].body as URLSearchParams
    expect(body.get('execution_options')).toBe('["VALIDATE"]')
  })
})

describe('deleteAd', () => {
  it('DELETEs /<id>?access_token=', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true })
    await deleteAd({ metaAdId: 'ad1', accessToken: 't' })
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toContain('/ad1?access_token=t')
    expect((global.fetch as jest.Mock).mock.calls[0][1].method).toBe('DELETE')
  })

  it('throws on non-ok', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ error: { message: 'Ad not found' } }),
    })
    await expect(deleteAd({ metaAdId: 'ad1', accessToken: 't' })).rejects.toThrow(/Ad not found/)
  })
})

describe('validateAd', () => {
  it('is updateAd with validateOnly: true', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    })
    await validateAd({ metaAdId: 'ad1', accessToken: 't', patch: { name: 'X' } })
    const body = (global.fetch as jest.Mock).mock.calls[0][1].body as URLSearchParams
    expect(body.get('execution_options')).toBe('["VALIDATE"]')
  })
})
