import { NextRequest } from 'next/server'

type MockUser = { uid: string; role: 'admin' | 'client' | 'ai'; orgId?: string; allowedOrgIds?: string[] }
type MockHandler = (req: NextRequest, user: MockUser, ctx?: unknown) => Promise<Response>

const mockCollection = jest.fn()
const mockDoc = jest.fn()
const mockGet = jest.fn()

let mockUser: MockUser = { uid: 'super-1', role: 'admin' }

jest.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: mockCollection },
}))

jest.mock('@/lib/api/auth', () => ({
  withAuth: (_role: string, handler: MockHandler) => async (req: NextRequest, ctx?: unknown) =>
    handler(req, mockUser, ctx),
}))

jest.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    serverTimestamp: jest.fn(() => 'SERVER_TIMESTAMP'),
  },
}))

beforeEach(() => {
  jest.resetModules()
  jest.clearAllMocks()
  mockUser = { uid: 'super-1', role: 'admin' }
  mockDoc.mockReturnValue({ get: mockGet })
  mockCollection.mockImplementation((name: string) => {
    if (name === 'hermes_profile_links') return { doc: mockDoc }
    throw new Error(`Unexpected collection: ${name}`)
  })
  global.fetch = jest.fn()
})

afterEach(() => {
  jest.restoreAllMocks()
})

async function readJson(res: Response) {
  return JSON.parse(await res.text())
}

function profileDoc(overrides: Record<string, unknown> = {}) {
  return {
    exists: true,
    data: () => ({
      profile: 'client-a',
      baseUrl: 'http://127.0.0.1:8651/',
      apiKey: 'secret-key',
      dashboardBaseUrl: 'http://127.0.0.1:9119/',
      dashboardSessionToken: 'dashboard-secret',
      enabled: true,
      capabilities: { runs: true, dashboard: true, cron: true, models: true, tools: true, files: true, terminal: true },
      permissions: { superAdmin: true, restrictedAdmin: true, client: false, allowedUserIds: [] },
      ...overrides,
    }),
  }
}

describe('Hermes admin controls proxy', () => {
  it('proxies an allowlisted models request through the first-class controls route', async () => {
    mockGet.mockResolvedValue(profileDoc())
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ models: ['claude-sonnet-4.6'] }),
    })

    const { GET } = await import('../../app/api/v1/admin/hermes/profiles/[orgId]/controls/[control]/[[...path]]/route')
    const res = await GET(
      new NextRequest('http://localhost/api/v1/admin/hermes/profiles/org-a/controls/models?provider=anthropic'),
      { params: Promise.resolve({ orgId: 'org-a', control: 'models' }) },
    )

    expect(res.status).toBe(200)
    expect(await readJson(res)).toEqual({ models: ['claude-sonnet-4.6'] })
    expect(global.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:8651/v1/models?provider=anthropic',
      expect.objectContaining({ method: 'GET', headers: expect.objectContaining({ 'Authorization': 'Bearer secret-key' }) }),
    )
  })

  it('uses the tools capability for skills requests', async () => {
    mockGet.mockResolvedValue(profileDoc({ capabilities: { runs: true, dashboard: true, cron: true, models: true, tools: false, files: true, terminal: true } }))

    const { GET } = await import('../../app/api/v1/admin/hermes/profiles/[orgId]/controls/[control]/[[...path]]/route')
    const res = await GET(
      new NextRequest('http://localhost/api/v1/admin/hermes/profiles/org-a/controls/skills'),
      { params: Promise.resolve({ orgId: 'org-a', control: 'skills' }) },
    )

    expect(res.status).toBe(403)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('sends dashboard controls to dashboardBaseUrl with the session token', async () => {
    mockGet.mockResolvedValue(profileDoc())
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ config: { provider: 'openrouter' } }),
    })

    const { GET } = await import('../../app/api/v1/admin/hermes/profiles/[orgId]/controls/[control]/[[...path]]/route')
    const res = await GET(
      new NextRequest('http://localhost/api/v1/admin/hermes/profiles/org-a/controls/config'),
      { params: Promise.resolve({ orgId: 'org-a', control: 'config' }) },
    )

    expect(res.status).toBe(200)
    expect(global.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:9119/api/config',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ 'X-Hermes-Session-Token': 'dashboard-secret' }),
      }),
    )
  })

  it('rejects non-allowlisted controls without calling Hermes', async () => {
    const { GET } = await import('../../app/api/v1/admin/hermes/profiles/[orgId]/controls/[control]/[[...path]]/route')
    const res = await GET(
      new NextRequest('http://localhost/api/v1/admin/hermes/profiles/org-a/controls/http:%2F%2Fevil.local'),
      { params: Promise.resolve({ orgId: 'org-a', control: 'http://evil.local' }) },
    )

    expect(res.status).toBe(404)
    expect(mockGet).not.toHaveBeenCalled()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('keeps the legacy dashboard proxy on the same allowlist', async () => {
    mockGet.mockResolvedValue(profileDoc())
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ok: true }),
    })

    const { GET } = await import('../../app/api/v1/admin/hermes/profiles/[orgId]/dashboard/[...path]/route')
    const res = await GET(
      new NextRequest('http://localhost/api/v1/admin/hermes/profiles/org-a/dashboard/api/logs?limit=10'),
      { params: Promise.resolve({ orgId: 'org-a', path: ['api', 'logs'] }) },
    )

    expect(res.status).toBe(200)
    expect(global.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:9119/api/logs?limit=10',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('proxies model dashboard subpaths for options/info/set', async () => {
    mockGet.mockResolvedValue(profileDoc())
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ providers: ['openrouter'] }),
    })

    const { GET } = await import('../../app/api/v1/admin/hermes/profiles/[orgId]/controls/[control]/[[...path]]/route')
    const res = await GET(
      new NextRequest('http://localhost/api/v1/admin/hermes/profiles/org-a/controls/model/options'),
      { params: Promise.resolve({ orgId: 'org-a', control: 'model', path: ['options'] }) },
    )

    expect(res.status).toBe(200)
    expect(global.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:9119/api/model/options',
      expect.objectContaining({ method: 'GET' }),
    )
  })
})
