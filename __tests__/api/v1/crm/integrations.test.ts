/**
 * Route-level tests for GET + POST /api/v1/crm/integrations
 *
 * Auth: GET → admin, POST → admin
 * Encryption: mocked to identity so we don't need SOCIAL_TOKEN_MASTER_KEY
 */

jest.mock('@/lib/firebase/admin', () => ({
  adminAuth: { verifySessionCookie: jest.fn() },
  adminDb: { collection: jest.fn() },
}))

jest.mock('@/lib/integrations/crypto', () => ({
  encryptCredentials: jest.fn((_config: unknown, _orgId: string) => ({
    enc: 'ENCRYPTED',
    tag: 'tag',
    iv: 'iv',
    keyVersion: 1,
  })),
  decryptCredentials: jest.fn((_blob: unknown, _orgId: string) => ({ apiKey: 'decrypted-key' })),
}))

import { adminAuth, adminDb } from '@/lib/firebase/admin'
import { encryptCredentials } from '@/lib/integrations/crypto'
import { seedOrgMember, callAsMember, callAsAgent } from '../../../helpers/crm'

const AI_API_KEY = 'test-ai-key-abc'
process.env.AI_API_KEY = AI_API_KEY
process.env.SESSION_COOKIE_NAME = '__session'

// ---------------------------------------------------------------------------
// stageAuth helper
// ---------------------------------------------------------------------------

function stageAuth(
  member: { uid: string; orgId: string; role: string; firstName?: string; lastName?: string },
  perms: Record<string, unknown> = {},
  opts?: {
    capturedAdd?: jest.Mock
    existingIntegrations?: Array<{ id: string; data: Record<string, unknown> }>
    addDocId?: string
  },
) {
  ;(adminAuth.verifySessionCookie as jest.Mock).mockResolvedValue({ uid: member.uid })
  ;(adminDb.collection as jest.Mock).mockImplementation((name: string) => {
    if (name === 'users')
      return {
        doc: () => ({
          get: () => Promise.resolve({ exists: true, data: () => ({ activeOrgId: member.orgId }) }),
        }),
      }
    if (name === 'orgMembers')
      return {
        doc: () => ({
          get: () => Promise.resolve({ exists: true, data: () => member }),
        }),
      }
    if (name === 'organizations')
      return {
        doc: () => ({
          get: () =>
            Promise.resolve({ exists: true, data: () => ({ settings: { permissions: perms } }) }),
        }),
      }
    if (name === 'crm_integrations') {
      const listDocs = (opts?.existingIntegrations ?? []).map((s) => ({
        id: s.id,
        data: () => s.data,
      }))
      const docId = opts?.addDocId ?? 'new-int-id'
      const addFn =
        opts?.capturedAdd ??
        jest.fn().mockResolvedValue({
          id: docId,
          get: jest.fn().mockResolvedValue({
            exists: true,
            data: () => ({
              orgId: member.orgId,
              provider: 'mailchimp',
              name: 'Test Integration',
              status: 'pending',
              configEnc: { enc: 'ENCRYPTED', tag: 'tag', iv: 'iv', keyVersion: 1 },
              autoTags: [],
              autoCampaignIds: [],
              cadenceMinutes: 0,
              lastSyncedAt: null,
              lastSyncStats: { imported: 0, created: 0, updated: 0, skipped: 0, errored: 0 },
              lastError: '',
              createdAt: null,
              updatedAt: null,
              deleted: false,
            }),
          }),
        })
      return {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ docs: listDocs }),
        add: addFn,
      }
    }
    return { doc: () => ({ get: () => Promise.resolve({ exists: false }) }) }
  })
}

// ---------------------------------------------------------------------------
// GET /api/v1/crm/integrations
// ---------------------------------------------------------------------------

describe('GET /api/v1/crm/integrations', () => {
  beforeEach(() => jest.clearAllMocks())

  it('admin can GET list — returns array of toPublicView shape', async () => {
    const admin = seedOrgMember('org-1', 'uid-admin', { role: 'admin' })
    stageAuth(admin, {}, {
      existingIntegrations: [
        {
          id: 'int-1',
          data: {
            orgId: 'org-1',
            provider: 'mailchimp',
            name: 'MC Integration',
            status: 'active',
            configEnc: { enc: 'ENC', tag: 't', iv: 'i', keyVersion: 1 },
            autoTags: [],
            autoCampaignIds: [],
            cadenceMinutes: 60,
            lastSyncedAt: null,
            lastSyncStats: { imported: 0, created: 0, updated: 0, skipped: 0, errored: 0 },
            lastError: '',
            createdAt: null,
            updatedAt: null,
            deleted: false,
          },
        },
      ],
    })
    const req = callAsMember(admin, 'GET', '/api/v1/crm/integrations')
    const { GET } = await import('@/app/api/v1/crm/integrations/route')
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    // Returns an array at the top level of data
    const list = Array.isArray(body.data) ? body.data : body.data.integrations
    expect(Array.isArray(list)).toBe(true)
    const item = list[0]
    // toPublicView shape — no raw configEnc, has configPreview
    expect(item).toHaveProperty('id')
    expect(item).toHaveProperty('provider')
    expect(item).toHaveProperty('configPreview')
    expect(item).not.toHaveProperty('configEnc')
    expect(item).not.toHaveProperty('config')
  })

  it('member cannot GET (403 — credential surface area)', async () => {
    const member = seedOrgMember('org-1', 'uid-member', { role: 'member' })
    stageAuth(member)
    const req = callAsMember(member, 'GET', '/api/v1/crm/integrations')
    const { GET } = await import('@/app/api/v1/crm/integrations/route')
    const res = await GET(req)
    expect(res.status).toBe(403)
  })

  it('viewer cannot GET (403 — admin-only route)', async () => {
    const viewer = seedOrgMember('org-1', 'uid-viewer', { role: 'viewer' })
    stageAuth(viewer)
    const req = callAsMember(viewer, 'GET', '/api/v1/crm/integrations')
    const { GET } = await import('@/app/api/v1/crm/integrations/route')
    const res = await GET(req)
    expect(res.status).toBe(403)
  })

  it('GET soft-deleted integrations are filtered from response', async () => {
    const admin = seedOrgMember('org-1', 'uid-admin', { role: 'admin' })
    stageAuth(admin, {}, {
      existingIntegrations: [
        {
          id: 'int-deleted',
          data: {
            orgId: 'org-1',
            provider: 'mailchimp',
            name: 'Deleted Integration',
            status: 'paused',
            configEnc: { enc: 'ENC', tag: 't', iv: 'i', keyVersion: 1 },
            autoTags: [],
            autoCampaignIds: [],
            cadenceMinutes: 0,
            lastSyncedAt: null,
            lastSyncStats: { imported: 0, created: 0, updated: 0, skipped: 0, errored: 0 },
            lastError: '',
            createdAt: null,
            updatedAt: null,
            deleted: true,
          },
        },
      ],
    })
    const req = callAsMember(admin, 'GET', '/api/v1/crm/integrations')
    const { GET } = await import('@/app/api/v1/crm/integrations/route')
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    const list = Array.isArray(body.data) ? body.data : body.data.integrations
    expect(list.length).toBe(0)
  })

  it('returns 401 without auth', async () => {
    const { NextRequest } = require('next/server')
    const req = new NextRequest('http://localhost/api/v1/crm/integrations')
    const { GET } = await import('@/app/api/v1/crm/integrations/route')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })
})

// ---------------------------------------------------------------------------
// POST /api/v1/crm/integrations
// ---------------------------------------------------------------------------

describe('POST /api/v1/crm/integrations', () => {
  beforeEach(() => jest.clearAllMocks())

  it('admin POST with valid provider+config — encrypts, writes configEnc, returns toPublicView', async () => {
    const admin = seedOrgMember('org-1', 'uid-admin', { role: 'admin', firstName: 'Ada', lastName: 'Min' })
    const capturedAdd = jest.fn().mockResolvedValue({
      id: 'int-new',
      get: jest.fn().mockResolvedValue({
        exists: true,
        data: () => ({
          orgId: 'org-1',
          provider: 'mailchimp',
          name: 'My Mailchimp',
          status: 'pending',
          configEnc: { enc: 'ENCRYPTED', tag: 'tag', iv: 'iv', keyVersion: 1 },
          autoTags: [],
          autoCampaignIds: [],
          cadenceMinutes: 0,
          lastSyncedAt: null,
          lastSyncStats: { imported: 0, created: 0, updated: 0, skipped: 0, errored: 0 },
          lastError: '',
          createdAt: null,
          updatedAt: null,
          deleted: false,
        }),
      }),
    })
    stageAuth(admin, {}, { capturedAdd })

    const config = { apiKey: 'test-api-key-us21', listId: 'abc123' }
    const req = callAsMember(admin, 'POST', '/api/v1/crm/integrations', {
      provider: 'mailchimp',
      name: 'My Mailchimp',
      config,
    })
    const { POST } = await import('@/app/api/v1/crm/integrations/route')
    const res = await POST(req)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.success).toBe(true)

    // encryptCredentials was called with the validated config
    expect(encryptCredentials).toHaveBeenCalled()
    const callArgs = (encryptCredentials as jest.Mock).mock.calls[0]
    expect(callArgs[0]).toMatchObject({ apiKey: 'test-api-key-us21', listId: 'abc123' })

    // Firestore .add was called with configEnc (encrypted blob)
    expect(capturedAdd).toHaveBeenCalled()
    const addArg = capturedAdd.mock.calls[0][0]
    expect(addArg).toHaveProperty('configEnc')
    expect(addArg.configEnc).toMatchObject({ enc: 'ENCRYPTED', tag: 'tag', iv: 'iv', keyVersion: 1 })
    expect(addArg).not.toHaveProperty('config')

    // Response is toPublicView — no raw configEnc, has configPreview
    expect(body.data).toHaveProperty('configPreview')
    expect(body.data).not.toHaveProperty('configEnc')
    expect(body.data).not.toHaveProperty('config')
    expect(body.data.provider).toBe('mailchimp')
  })

  it('admin POST writes createdByRef and updatedByRef', async () => {
    const admin = seedOrgMember('org-1', 'uid-admin', { role: 'admin', firstName: 'Ada', lastName: 'Min' })
    const capturedAdd = jest.fn().mockResolvedValue({
      id: 'int-new',
      get: jest.fn().mockResolvedValue({
        exists: true,
        data: () => ({
          orgId: 'org-1',
          provider: 'mailchimp',
          name: 'My Mailchimp',
          status: 'pending',
          configEnc: { enc: 'ENCRYPTED', tag: 'tag', iv: 'iv', keyVersion: 1 },
          autoTags: [],
          autoCampaignIds: [],
          cadenceMinutes: 0,
          lastSyncedAt: null,
          lastSyncStats: { imported: 0, created: 0, updated: 0, skipped: 0, errored: 0 },
          lastError: '',
          createdAt: null,
          updatedAt: null,
          deleted: false,
        }),
      }),
    })
    stageAuth(admin, {}, { capturedAdd })

    const req = callAsMember(admin, 'POST', '/api/v1/crm/integrations', {
      provider: 'mailchimp',
      name: 'My Mailchimp',
      config: { apiKey: 'key-us21', listId: 'list1' },
    })
    const { POST } = await import('@/app/api/v1/crm/integrations/route')
    const res = await POST(req)
    expect(res.status).toBe(201)
    const body = await res.json()

    // Check Firestore write includes attribution refs
    const addArg = capturedAdd.mock.calls[0][0]
    expect(addArg).toHaveProperty('createdByRef')
    expect(addArg).toHaveProperty('updatedByRef')
    expect(addArg.createdByRef.displayName).toBe('Ada Min')
    expect(addArg.createdByRef.kind).toBe('human')
    expect(addArg.createdBy).toBe('uid-admin')

    // Response contains configPreview from toPublicView
    expect(body.data.configPreview).toBeDefined()
  })

  it('agent POST writes AGENT_PIP_REF and omits createdBy uid', async () => {
    const capturedAdd = jest.fn().mockResolvedValue({
      id: 'int-agent',
      get: jest.fn().mockResolvedValue({
        exists: true,
        data: () => ({
          orgId: 'org-1',
          provider: 'mailchimp',
          name: 'Agent Integration',
          status: 'pending',
          configEnc: { enc: 'ENCRYPTED', tag: 'tag', iv: 'iv', keyVersion: 1 },
          autoTags: [],
          autoCampaignIds: [],
          cadenceMinutes: 0,
          lastSyncedAt: null,
          lastSyncStats: { imported: 0, created: 0, updated: 0, skipped: 0, errored: 0 },
          lastError: '',
          createdAt: null,
          updatedAt: null,
          deleted: false,
        }),
      }),
    })
    ;(adminDb.collection as jest.Mock).mockImplementation((name: string) => {
      if (name === 'organizations')
        return {
          doc: () => ({
            get: () => Promise.resolve({ exists: true, data: () => ({ settings: { permissions: {} } }) }),
          }),
        }
      if (name === 'crm_integrations')
        return {
          where: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue({ docs: [] }),
          add: capturedAdd,
        }
      return { doc: () => ({ get: () => Promise.resolve({ exists: false }) }) }
    })

    const req = callAsAgent('org-1', 'POST', '/api/v1/crm/integrations', {
      provider: 'mailchimp',
      name: 'Agent Integration',
      config: { apiKey: 'key-us21', listId: 'list1' },
    }, AI_API_KEY)
    const { POST } = await import('@/app/api/v1/crm/integrations/route')
    const res = await POST(req)
    expect(res.status).toBe(201)
    const body = await res.json()

    const addArg = capturedAdd.mock.calls[0][0]
    expect(addArg.createdByRef.uid).toBe('agent:pip')
    expect(addArg.createdByRef.kind).toBe('agent')
    expect(addArg.createdBy).toBeUndefined()
  })

  it('POST with unknown provider → 400', async () => {
    const admin = seedOrgMember('org-1', 'uid-admin', { role: 'admin' })
    stageAuth(admin)
    const req = callAsMember(admin, 'POST', '/api/v1/crm/integrations', {
      provider: 'unknown-crm',
      name: 'Bad provider',
      config: {},
    })
    const { POST } = await import('@/app/api/v1/crm/integrations/route')
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('POST with missing required config field → 400', async () => {
    const admin = seedOrgMember('org-1', 'uid-admin', { role: 'admin' })
    stageAuth(admin)
    // mailchimp requires apiKey and listId — omit apiKey
    const req = callAsMember(admin, 'POST', '/api/v1/crm/integrations', {
      provider: 'mailchimp',
      name: 'Incomplete MC',
      config: { listId: 'abc123' }, // missing apiKey
    })
    const { POST } = await import('@/app/api/v1/crm/integrations/route')
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('POST without provider → 400', async () => {
    const admin = seedOrgMember('org-1', 'uid-admin', { role: 'admin' })
    stageAuth(admin)
    const req = callAsMember(admin, 'POST', '/api/v1/crm/integrations', {
      name: 'No provider',
      config: {},
    })
    const { POST } = await import('@/app/api/v1/crm/integrations/route')
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('POST without name → 400', async () => {
    const admin = seedOrgMember('org-1', 'uid-admin', { role: 'admin' })
    stageAuth(admin)
    const req = callAsMember(admin, 'POST', '/api/v1/crm/integrations', {
      provider: 'mailchimp',
      config: { apiKey: 'key', listId: 'list' },
    })
    const { POST } = await import('@/app/api/v1/crm/integrations/route')
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('member cannot POST (403)', async () => {
    const member = seedOrgMember('org-1', 'uid-member', { role: 'member' })
    stageAuth(member)
    const req = callAsMember(member, 'POST', '/api/v1/crm/integrations', {
      provider: 'mailchimp',
      name: 'Attempt',
      config: { apiKey: 'key', listId: 'list' },
    })
    const { POST } = await import('@/app/api/v1/crm/integrations/route')
    const res = await POST(req)
    expect(res.status).toBe(403)
  })

  it('viewer cannot POST (403)', async () => {
    const viewer = seedOrgMember('org-1', 'uid-viewer', { role: 'viewer' })
    stageAuth(viewer)
    const req = callAsMember(viewer, 'POST', '/api/v1/crm/integrations', {
      provider: 'mailchimp',
      name: 'Attempt',
      config: { apiKey: 'key', listId: 'list' },
    })
    const { POST } = await import('@/app/api/v1/crm/integrations/route')
    const res = await POST(req)
    expect(res.status).toBe(403)
  })
})
