const mockFetch = jest.fn()
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(global as any).fetch = mockFetch

import { findInboundLinks } from '@/lib/seo/integrations/commoncrawl/client'

beforeEach(() => mockFetch.mockReset())

describe('commoncrawl/client', () => {
  it('parses NDJSON output to URLs', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => '{"url":"https://a.com"}\n{"url":"https://b.com"}\n',
    })
    const urls = await findInboundLinks('example.com')
    expect(urls).toEqual(['https://a.com', 'https://b.com'])
  })
  it('returns [] on fetch failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('net'))
    expect(await findInboundLinks('example.com')).toEqual([])
  })
})
