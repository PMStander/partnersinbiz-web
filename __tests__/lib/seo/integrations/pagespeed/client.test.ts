const mockFetch = jest.fn()
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(global as any).fetch = mockFetch

import { runPageSpeed } from '@/lib/seo/integrations/pagespeed/client'

beforeEach(() => mockFetch.mockReset())

describe('pagespeed/client', () => {
  it('runPageSpeed maps Lighthouse result', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        lighthouseResult: {
          categories: {
            performance: { score: 0.92 },
            seo: { score: 0.88 },
            accessibility: { score: 1.0 },
            'best-practices': { score: 0.75 },
          },
          audits: {
            'largest-contentful-paint': { numericValue: 1800 },
            'cumulative-layout-shift': { numericValue: 0.05 },
            interactive: { numericValue: 2100 },
          },
        },
      }),
    })
    const r = await runPageSpeed('https://example.com')
    expect(r.performance).toBe(92)
    expect(r.seo).toBe(88)
    expect(r.accessibility).toBe(100)
    expect(r.bestPractices).toBe(75)
    expect(r.lcp).toBe(1800)
    expect(r.cls).toBe(0.05)
  })
})
