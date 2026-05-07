// __tests__/api/v1/crm/integrations-sync.test.ts
//
// Tests for POST /api/v1/crm/integrations/[id]/sync
// Verifies that mailchimp, hubspot and gmail handlers are all wired up,
// that guard conditions (syncing, paused) return 422, that an unknown
// provider returns an error payload, and that cross-org access is blocked.

import { NextRequest } from 'next/server'

// ── Auth mock ──────────────────────────────────────────────────────────────
jest.mock('@/lib/api/auth', () => ({
  withAuth: (role: string, handler: Function) =>
    (req: Request, ctx?: unknown) =>
      handler(req, { uid: 'user1', orgId: 'org1', role }, ctx),
}))

// ── Firebase admin mock ────────────────────────────────────────────────────
const mockDocGet = jest.fn()
const mockDocUpdate = jest.fn()
const mockDocRef = { get: mockDocGet, update: mockDocUpdate, ref: { update: mockDocUpdate, get: mockDocGet } }
const mockDoc = jest.fn(() => mockDocRef)

jest.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: jest.fn(() => ({ doc: mockDoc })),
  },
}))

// ── Handler mocks ──────────────────────────────────────────────────────────
const mockSyncMailchimp = jest.fn()
const mockSyncHubspot = jest.fn()
const mockSyncGmail = jest.fn()

jest.mock('@/lib/crm/integrations/handlers/mailchimp', () => ({
  syncMailchimp: (...args: unknown[]) => mockSyncMailchimp(...args),
}))
jest.mock('@/lib/crm/integrations/handlers/hubspot', () => ({
  syncHubspot: (...args: unknown[]) => mockSyncHubspot(...args),
}))
jest.mock('@/lib/crm/integrations/handlers/gmail', () => ({
  syncGmail: (...args: unknown[]) => mockSyncGmail(...args),
}))

// ── firebase-admin/firestore FieldValue stub ───────────────────────────────
jest.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    serverTimestamp: () => ({ _sentinel: 'ServerTimestamp' }),
    increment: (n: number) => ({ _sentinel: 'Increment', n }),
  },
}))

process.env.AI_API_KEY = 'test-key'

import { POST } from '@/app/api/v1/crm/integrations/[id]/sync/route'
import { EMPTY_SYNC_STATS } from '@/lib/crm/integrations/types'

// ── Helpers ────────────────────────────────────────────────────────────────

const GOOD_STATS = { imported: 5, skipped: 0, errors: 0, total: 5, created: 5, updated: 0, errored: 0 }
const SYNC_RESULT_OK = { ok: true, stats: GOOD_STATS, error: '' }

function makeRequest(integrationId = 'int-1') {
  return new NextRequest(
    `http://localhost/api/v1/crm/integrations/${integrationId}/sync`,
    {
      method: 'POST',
      headers: {
        authorization: 'Bearer test-key',
        'content-type': 'application/json',
      },
    },
  )
}

function makeContext(integrationId = 'int-1') {
  return { params: Promise.resolve({ id: integrationId }) }
}

function fakeIntegration(overrides: object = {}) {
  return {
    id: 'int-1',
    orgId: 'org1',
    provider: 'mailchimp',
    name: 'Test Integration',
    status: 'active',
    config: { apiKey: 'key-us21', listId: 'list1' },
    autoTags: [],
    autoCampaignIds: [],
    cadenceMinutes: 0,
    lastSyncedAt: null,
    lastSyncStats: { ...EMPTY_SYNC_STATS },
    lastError: '',
    createdAt: null,
    updatedAt: null,
    deleted: false,
    ...overrides,
  }
}

function mockIntegrationDoc(integration: object | null) {
  const exists = integration !== null
  const data = () => integration ?? {}

  // The snap object returned by the initial .doc(id).get()
  // The route then calls snap.ref.update(...) and snap.ref.get()
  const snapRef = {
    update: mockDocUpdate,
    get: jest.fn().mockResolvedValue({ exists, data, id: 'int-1' }),
  }

  mockDocGet.mockResolvedValue({ exists, data, id: 'int-1', ref: snapRef })
  mockDocUpdate.mockResolvedValue(undefined)
}

// ── Tests ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks()
})

describe('POST /api/v1/crm/integrations/[id]/sync', () => {
  // ── mailchimp ──────────────────────────────────────────────────────────
  it('calls syncMailchimp and returns ok+stats for mailchimp provider', async () => {
    mockIntegrationDoc(fakeIntegration({ provider: 'mailchimp' }))
    mockSyncMailchimp.mockResolvedValue(SYNC_RESULT_OK)

    const res = await POST(makeRequest(), makeContext())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(mockSyncMailchimp).toHaveBeenCalledTimes(1)
    expect(mockSyncHubspot).not.toHaveBeenCalled()
    expect(mockSyncGmail).not.toHaveBeenCalled()
    expect(body.data.ok).toBe(true)
    expect(body.data.stats).toMatchObject({ imported: 5 })
  })

  // ── hubspot ────────────────────────────────────────────────────────────
  it('calls syncHubspot and returns ok+stats for hubspot provider', async () => {
    mockIntegrationDoc(fakeIntegration({ provider: 'hubspot' }))
    mockSyncHubspot.mockResolvedValue(SYNC_RESULT_OK)

    const res = await POST(makeRequest(), makeContext())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(mockSyncHubspot).toHaveBeenCalledTimes(1)
    expect(mockSyncMailchimp).not.toHaveBeenCalled()
    expect(mockSyncGmail).not.toHaveBeenCalled()
    expect(body.data.ok).toBe(true)
    expect(body.data.stats).toMatchObject({ imported: 5 })
  })

  // ── gmail ──────────────────────────────────────────────────────────────
  it('calls syncGmail and returns ok+stats for gmail provider', async () => {
    mockIntegrationDoc(fakeIntegration({ provider: 'gmail' }))
    mockSyncGmail.mockResolvedValue(SYNC_RESULT_OK)

    const res = await POST(makeRequest(), makeContext())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(mockSyncGmail).toHaveBeenCalledTimes(1)
    expect(mockSyncMailchimp).not.toHaveBeenCalled()
    expect(mockSyncHubspot).not.toHaveBeenCalled()
    expect(body.data.ok).toBe(true)
    expect(body.data.stats).toMatchObject({ imported: 5 })
  })

  // ── status guards ──────────────────────────────────────────────────────
  it('returns 422 when integration is already syncing', async () => {
    mockIntegrationDoc(fakeIntegration({ status: 'syncing' }))

    const res = await POST(makeRequest(), makeContext())
    const body = await res.json()

    expect(res.status).toBe(422)
    expect(body.success).toBe(false)
    expect(body.error).toMatch(/sync.*in progress/i)
    expect(mockSyncMailchimp).not.toHaveBeenCalled()
  })

  it('returns 422 when integration is paused', async () => {
    mockIntegrationDoc(fakeIntegration({ status: 'paused' }))

    const res = await POST(makeRequest(), makeContext())
    const body = await res.json()

    expect(res.status).toBe(422)
    expect(body.success).toBe(false)
    expect(body.error).toMatch(/paused/i)
    expect(mockSyncMailchimp).not.toHaveBeenCalled()
  })

  // ── unknown provider ───────────────────────────────────────────────────
  it('returns ok=false with provider name in error for unknown provider (zapier)', async () => {
    mockIntegrationDoc(fakeIntegration({ provider: 'zapier' }))

    const res = await POST(makeRequest(), makeContext())
    const body = await res.json()

    // Route returns 200 with ok=false (handled gracefully, not a hard error)
    expect(res.status).toBe(200)
    expect(body.data.ok).toBe(false)
    expect(body.data.error).toMatch(/zapier/)
    expect(mockSyncMailchimp).not.toHaveBeenCalled()
    expect(mockSyncHubspot).not.toHaveBeenCalled()
    expect(mockSyncGmail).not.toHaveBeenCalled()
  })

  // ── cross-org access ───────────────────────────────────────────────────
  it('returns 403 when integration belongs to a different org', async () => {
    // Integration has orgId 'org2' but the auth user has orgId 'org1'
    mockIntegrationDoc(fakeIntegration({ orgId: 'org2' }))

    const res = await POST(makeRequest(), makeContext())
    const body = await res.json()

    expect(res.status).toBe(403)
    expect(body.success).toBe(false)
    expect(mockSyncMailchimp).not.toHaveBeenCalled()
  })
})
