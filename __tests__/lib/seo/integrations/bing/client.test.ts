process.env.BING_WMT_API_KEY = 'k'

const mockFetch = jest.fn()
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(global as any).fetch = mockFetch

import { fetchInboundLinks } from '@/lib/seo/integrations/bing/client'

beforeEach(() => mockFetch.mockReset())

describe('bing/client', () => {
  it('fetchInboundLinks calls Bing API with apikey query param and maps result', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ d: [{ Url: 'https://x', SourceUrl: 'https://src', AnchorText: 'a' }] }),
    })
    const links = await fetchInboundLinks('https://example.com')
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('apikey=k'))
    expect(links).toHaveLength(1)
    expect(links[0].sourceUrl).toBe('https://src')
    expect(links[0].anchorText).toBe('a')
  })

  it('throws when API returns non-ok', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) })
    await expect(fetchInboundLinks('https://example.com')).rejects.toThrow(/Bing WMT error 500/)
  })
})
