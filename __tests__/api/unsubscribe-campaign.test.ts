// __tests__/api/unsubscribe-campaign.test.ts
//
// Tests for per-campaign unsubscribe pages (Item 1).

import { NextRequest } from 'next/server'

// ── Firebase mock ──────────────────────────────────────────────────────────
const mockGet = jest.fn()
const mockUpdate = jest.fn()
const mockAdd = jest.fn()
const mockDoc = jest.fn()
const mockWhere = jest.fn()
const mockCollection = jest.fn()

jest.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: mockCollection },
}))

// ── Integrations sync mock (no-op) ─────────────────────────────────────────
jest.mock('@/lib/crm/integrations/syncOptOut', () => ({
  syncUnsubscribeToIntegrations: jest.fn().mockResolvedValue(undefined),
}))

// ── Env ────────────────────────────────────────────────────────────────────
process.env.UNSUBSCRIBE_TOKEN_SECRET = 'test-secret-1234567890abcdef'

// ── Import after mocks ──────────────────────────────────────────────────────
import { signUnsubscribeToken, verifyUnsubscribeToken } from '@/lib/email/unsubscribeToken'

function makeReq(token: string) {
  return new NextRequest(`http://localhost/api/unsubscribe?token=${encodeURIComponent(token)}`)
}

// Build a chainable Firestore query mock
function makeQuery() {
  const q: Record<string, jest.Mock> = {}
  q.where = jest.fn(() => q)
  q.orderBy = jest.fn(() => q)
  q.get = mockGet
  return q
}

beforeEach(() => {
  jest.clearAllMocks()
  const q = makeQuery()
  mockWhere.mockReturnValue(q)
  mockDoc.mockReturnValue({ get: mockGet, update: mockUpdate })
  mockCollection.mockImplementation(() => ({
    where: mockWhere,
    doc: mockDoc,
    add: mockAdd,
    get: mockGet,
  }))
})

// ── Helpers ────────────────────────────────────────────────────────────────
const CONTACT_ID = 'ABCDEFGHIJKLMNOPQRST'  // 20-char alphanumeric
const CAMPAIGN_ID = 'CAMPAIGNID1234567890'
const ORG_ID      = 'ORG0000000000000001a'

function mockContactDoc(opts: { exists?: boolean; unsubscribed?: boolean } = {}) {
  mockDoc.mockImplementation((id: string) => {
    if (id === CONTACT_ID) {
      return {
        get: jest.fn().mockResolvedValue({
          exists: opts.exists ?? true,
          data: () => opts.unsubscribed
            ? { orgId: ORG_ID, unsubscribed: true, unsubscribedAt: new Date() }
            : { orgId: ORG_ID },
          ref: { update: mockUpdate },
        }),
        update: mockUpdate,
      }
    }
    // campaign doc
    if (id === CAMPAIGN_ID) {
      return {
        get: jest.fn().mockResolvedValue({
          exists: true,
          data: () => ({ name: 'Summer Launch', orgId: ORG_ID }),
        }),
        update: mockUpdate,
      }
    }
    // org doc
    if (id === ORG_ID) {
      return {
        get: jest.fn().mockResolvedValue({
          exists: true,
          data: () => ({ name: 'Acme Corp' }),
        }),
      }
    }
    return { get: jest.fn().mockResolvedValue({ exists: false, data: () => ({}) }), update: mockUpdate }
  })

  // enrollments query — return empty (no active enrollments)
  mockGet.mockResolvedValue({ docs: [] })
}

// ── Tests ──────────────────────────────────────────────────────────────────

test('token with campaignId decodes correctly and shows campaign name in page', async () => {
  mockContactDoc()

  const token = signUnsubscribeToken(CONTACT_ID, CAMPAIGN_ID)
  const verified = verifyUnsubscribeToken(token)
  expect(verified.ok).toBe(true)
  if (!verified.ok) return
  expect(verified.contactId).toBe(CONTACT_ID)
  expect(verified.campaignId).toBe(CAMPAIGN_ID)

  const { GET } = await import('@/app/api/unsubscribe/route')
  const res = await GET(makeReq(token))
  expect(res.status).toBe(200)
  const html = await res.text()
  expect(html).toContain('Summer Launch')
  expect(html).toContain('Acme Corp')
  expect(html).toContain("You've been unsubscribed")
})

test('token without campaignId still works (backward compat)', async () => {
  mockContactDoc()

  const token = signUnsubscribeToken(CONTACT_ID)
  const verified = verifyUnsubscribeToken(token)
  expect(verified.ok).toBe(true)
  if (!verified.ok) return
  expect(verified.contactId).toBe(CONTACT_ID)
  expect((verified as { campaignId?: string }).campaignId).toBeUndefined()

  const { GET } = await import('@/app/api/unsubscribe/route')
  const res = await GET(makeReq(token))
  expect(res.status).toBe(200)
  const html = await res.text()
  expect(html).toContain("You've been unsubscribed")
  // Generic copy when no campaign
  expect(html).toContain('email list')
})

test('invalid/unknown campaignId in token falls back to generic page, not an error', async () => {
  // Mock contact exists but campaign doc does not
  mockDoc.mockImplementation((id: string) => {
    if (id === CONTACT_ID) {
      return {
        get: jest.fn().mockResolvedValue({
          exists: true,
          data: () => ({ orgId: ORG_ID }),
          ref: { update: mockUpdate },
        }),
        update: mockUpdate,
      }
    }
    // unknown campaign
    return {
      get: jest.fn().mockResolvedValue({ exists: false, data: () => ({}) }),
      update: mockUpdate,
    }
  })
  mockGet.mockResolvedValue({ docs: [] })

  const unknownCampaignId = 'UNKNOWNCAMPAIGN12345'
  const token = signUnsubscribeToken(CONTACT_ID, unknownCampaignId)

  const { GET } = await import('@/app/api/unsubscribe/route')
  const res = await GET(makeReq(token))
  expect(res.status).toBe(200)
  const html = await res.text()
  expect(html).toContain("You've been unsubscribed")
  // Falls back to generic copy
  expect(html).toContain('email list')
})

test('already-unsubscribed contact returns 200 with appropriate message', async () => {
  mockContactDoc({ unsubscribed: true })

  const token = signUnsubscribeToken(CONTACT_ID, CAMPAIGN_ID)

  const { GET } = await import('@/app/api/unsubscribe/route')
  const res = await GET(makeReq(token))
  expect(res.status).toBe(200)
  const html = await res.text()
  expect(html).toContain('Already unsubscribed')
})
