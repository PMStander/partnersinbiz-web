// __tests__/lib/ads/registry.test.ts
import { getProvider } from '@/lib/ads/registry'
import { NotImplementedError, UnknownProviderError } from '@/lib/ads/provider'

describe('getProvider', () => {
  it('returns a Meta provider with the Phase 1 methods bound', () => {
    const p = getProvider('meta')
    expect(p.platform).toBe('meta')
    expect(typeof p.getAuthorizeUrl).toBe('function')
    expect(typeof p.exchangeCodeForToken).toBe('function')
    expect(typeof p.listAdAccounts).toBe('function')
  })

  it('returns stubs for non-Meta platforms that throw NotImplementedError', () => {
    for (const platform of ['google', 'linkedin', 'tiktok'] as const) {
      const p = getProvider(platform)
      expect(p.platform).toBe(platform)
      expect(() => p.getAuthorizeUrl({ redirectUri: '', state: '', orgId: '' })).toThrow(
        NotImplementedError,
      )
    }
  })

  it('throws UnknownProviderError for invalid platform', () => {
    // @ts-expect-error: testing runtime behavior
    expect(() => getProvider('twitter')).toThrow(UnknownProviderError)
  })
})
