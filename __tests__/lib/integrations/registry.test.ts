import {
  registerAdapter,
  getAdapter,
  getAdapterOrThrow,
  listAdapters,
} from '@/lib/integrations/registry'
import type { IntegrationAdapter } from '@/lib/integrations/types'

const stubAdapter = (provider: IntegrationAdapter['provider']): IntegrationAdapter => ({
  provider,
  authKind: 'api_key',
  display: { name: provider, description: 'stub' },
  pullDaily: async () => ({ from: '2026-04-01', to: '2026-04-26', metricsWritten: 0 }),
})

describe('integration registry', () => {
  it('returns null for an unregistered provider', () => {
    expect(getAdapter('firebase_analytics')).toBeNull()
  })

  it('throws for an unregistered provider via getAdapterOrThrow', () => {
    expect(() => getAdapterOrThrow('firebase_analytics')).toThrow(
      /No integration adapter registered/,
    )
  })

  it('registers and retrieves an adapter', () => {
    const adapter = stubAdapter('revenuecat')
    registerAdapter(adapter)
    expect(getAdapter('revenuecat')).toBe(adapter)
    expect(getAdapterOrThrow('revenuecat')).toBe(adapter)
  })

  it('listAdapters returns all registered', () => {
    registerAdapter(stubAdapter('adsense'))
    registerAdapter(stubAdapter('admob'))
    const all = listAdapters().map((a) => a.provider)
    expect(all).toContain('adsense')
    expect(all).toContain('admob')
  })
})
