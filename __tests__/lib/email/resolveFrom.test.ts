import { resolveFrom } from '@/lib/email/resolveFrom'

const mockGet = jest.fn()
const mockDoc = jest.fn(() => ({ get: mockGet }))

jest.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: () => ({ doc: (_id: string) => mockDoc() }),
  },
}))

beforeEach(() => {
  jest.clearAllMocks()
})

describe('resolveFrom', () => {
  it('falls back to shared PIB domain when no fromDomainId provided', async () => {
    const r = await resolveFrom({ orgName: 'AHS Law' })
    expect(r.isFallback).toBe(true)
    expect(r.fromDomain).toBe('partnersinbiz.online')
    expect(r.from).toContain('campaigns@partnersinbiz.online')
    expect(r.from).toContain('AHS Law')
  })

  it('falls back when fromDomainId points to non-existent doc', async () => {
    mockGet.mockResolvedValue({ exists: false })
    const r = await resolveFrom({ fromDomainId: 'missing', orgName: 'AHS Law' })
    expect(r.isFallback).toBe(true)
  })

  it('falls back when domain is not verified', async () => {
    mockGet.mockResolvedValue({
      exists: true,
      id: 'd1',
      data: () => ({ orgId: 'o1', name: 'ahs-law.co.za', status: 'pending', deleted: false }),
    })
    const r = await resolveFrom({ fromDomainId: 'd1', orgName: 'AHS Law' })
    expect(r.isFallback).toBe(true)
  })

  it('uses verified domain with custom name + local', async () => {
    mockGet.mockResolvedValue({
      exists: true,
      id: 'd1',
      data: () => ({ orgId: 'o1', name: 'ahs-law.co.za', status: 'verified', deleted: false }),
    })
    const r = await resolveFrom({
      fromDomainId: 'd1',
      fromName: 'AHS Law',
      fromLocal: 'noreply',
    })
    expect(r.isFallback).toBe(false)
    expect(r.fromDomain).toBe('ahs-law.co.za')
    expect(r.from).toBe('AHS Law <noreply@ahs-law.co.za>')
  })

  it('defaults local to "campaigns" when not provided', async () => {
    mockGet.mockResolvedValue({
      exists: true,
      id: 'd1',
      data: () => ({ orgId: 'o1', name: 'ahs-law.co.za', status: 'verified', deleted: false }),
    })
    const r = await resolveFrom({ fromDomainId: 'd1', orgName: 'AHS Law' })
    expect(r.from).toBe('AHS Law <campaigns@ahs-law.co.za>')
  })

  it('falls back when domain is soft-deleted', async () => {
    mockGet.mockResolvedValue({
      exists: true,
      id: 'd1',
      data: () => ({ orgId: 'o1', name: 'ahs-law.co.za', status: 'verified', deleted: true }),
    })
    const r = await resolveFrom({ fromDomainId: 'd1', orgName: 'AHS Law' })
    expect(r.isFallback).toBe(true)
  })
})
