process.env.OPR_API_KEY = 'k'

const mockFetch = jest.fn()
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(global as any).fetch = mockFetch

import { getPageRank } from '@/lib/seo/integrations/openpagerank/client'

beforeEach(() => mockFetch.mockReset())

describe('openpagerank/client', () => {
  it('returns rank * 10 for status 200 entries', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        response: [
          { status_code: 200, domain: 'a.com', page_rank_decimal: '5.5' },
          { status_code: 404, domain: 'b.com' },
        ],
      }),
    })
    const r = await getPageRank(['a.com', 'b.com'])
    expect(r['a.com']).toBe(55)
    expect(r['b.com']).toBeUndefined()
  })
})
