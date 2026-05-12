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
      enabled: true,
      capabilities: { runs: true, dashboard: true, cron: true, models: true, tools: true, files: true, terminal: true },
      permissions: { superAdmin: true, restrictedAdmin: true, client: false, allowedUserIds: [] },
      ...overrides,
    }),
  }
}

function mockHermesResponse(data: unknown, status = 200) {
  ;(global.fetch as jest.Mock).mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(data),
  })
}

describe('Hermes profile-scoped jobs CRUD proxy', () => {
  it('lists jobs with query params through the linked Hermes profile', async () => {
    mockGet.mockResolvedValue(profileDoc())
    mockHermesResponse({ jobs: [{ id: 'job-1', name: 'Daily SEO report' }] })

    const { GET } = await import('@/app/api/v1/admin/hermes/profiles/[orgId]/jobs/route')
    const res = await GET(new NextRequest('http://localhost/api/v1/admin/hermes/profiles/org-a/jobs?status=active'), {
      params: Promise.resolve({ orgId: 'org-a' }),
    })

    expect(res.status).toBe(200)
    expect(await readJson(res)).toEqual({ jobs: [{ id: 'job-1', name: 'Daily SEO report' }] })
    expect(global.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:8651/api/jobs?status=active',
      expect.objectContaining({ method: 'GET', headers: expect.objectContaining({ 'X-API-Key': 'secret-key' }) }),
    )
  })

  it('creates a job without exposing the API key in the response body', async () => {
    mockGet.mockResolvedValue(profileDoc())
    mockHermesResponse({ id: 'job-1', name: 'Daily SEO report', apiKey: undefined }, 201)

    const { POST } = await import('@/app/api/v1/admin/hermes/profiles/[orgId]/jobs/route')
    const res = await POST(
      new NextRequest('http://localhost/api/v1/admin/hermes/profiles/org-a/jobs', {
        method: 'POST',
        body: JSON.stringify({ name: 'Daily SEO report', schedule: '0 8 * * *', prompt: 'Write SEO report' }),
      }),
      { params: Promise.resolve({ orgId: 'org-a' }) },
    )

    expect(res.status).toBe(201)
    const body = await readJson(res)
    expect(body).toMatchObject({ id: 'job-1', name: 'Daily SEO report' })
    expect(body.secretKey).toBeUndefined()
    expect(global.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:8651/api/jobs',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'Daily SEO report', schedule: '0 8 * * *', prompt: 'Write SEO report' }),
        headers: expect.objectContaining({ 'Content-Type': 'application/json', 'X-API-Key': 'secret-key' }),
      }),
    )
  })

  it('gets, patches, deletes, and invokes job actions', async () => {
    mockGet.mockResolvedValue(profileDoc())
    mockHermesResponse({ id: 'job-1', paused: false })

    const itemRoute = await import('@/app/api/v1/admin/hermes/profiles/[orgId]/jobs/[jobId]/route')
    let res = await itemRoute.GET(new NextRequest('http://localhost/api/v1/admin/hermes/profiles/org-a/jobs/job-1'), {
      params: Promise.resolve({ orgId: 'org-a', jobId: 'job-1' }),
    })
    expect(res.status).toBe(200)

    res = await itemRoute.PATCH(
      new NextRequest('http://localhost/api/v1/admin/hermes/profiles/org-a/jobs/job-1', {
        method: 'PATCH',
        body: JSON.stringify({ paused: true }),
      }),
      { params: Promise.resolve({ orgId: 'org-a', jobId: 'job-1' }) },
    )
    expect(res.status).toBe(200)

    const pauseRoute = await import('@/app/api/v1/admin/hermes/profiles/[orgId]/jobs/[jobId]/pause/route')
    res = await pauseRoute.POST(new NextRequest('http://localhost/api/v1/admin/hermes/profiles/org-a/jobs/job-1/pause', { method: 'POST' }), {
      params: Promise.resolve({ orgId: 'org-a', jobId: 'job-1' }),
    })
    expect(res.status).toBe(200)

    const resumeRoute = await import('@/app/api/v1/admin/hermes/profiles/[orgId]/jobs/[jobId]/resume/route')
    res = await resumeRoute.POST(new NextRequest('http://localhost/api/v1/admin/hermes/profiles/org-a/jobs/job-1/resume', { method: 'POST' }), {
      params: Promise.resolve({ orgId: 'org-a', jobId: 'job-1' }),
    })
    expect(res.status).toBe(200)

    const runRoute = await import('@/app/api/v1/admin/hermes/profiles/[orgId]/jobs/[jobId]/run/route')
    res = await runRoute.POST(new NextRequest('http://localhost/api/v1/admin/hermes/profiles/org-a/jobs/job-1/run', { method: 'POST' }), {
      params: Promise.resolve({ orgId: 'org-a', jobId: 'job-1' }),
    })
    expect(res.status).toBe(200)

    res = await itemRoute.DELETE(new NextRequest('http://localhost/api/v1/admin/hermes/profiles/org-a/jobs/job-1', { method: 'DELETE' }), {
      params: Promise.resolve({ orgId: 'org-a', jobId: 'job-1' }),
    })
    expect(res.status).toBe(200)

    expect(global.fetch).toHaveBeenNthCalledWith(1, 'http://127.0.0.1:8651/api/jobs/job-1', expect.objectContaining({ method: 'GET' }))
    expect(global.fetch).toHaveBeenNthCalledWith(2, 'http://127.0.0.1:8651/api/jobs/job-1', expect.objectContaining({ method: 'PATCH' }))
    expect(global.fetch).toHaveBeenNthCalledWith(3, 'http://127.0.0.1:8651/api/jobs/job-1/pause', expect.objectContaining({ method: 'POST' }))
    expect(global.fetch).toHaveBeenNthCalledWith(4, 'http://127.0.0.1:8651/api/jobs/job-1/resume', expect.objectContaining({ method: 'POST' }))
    expect(global.fetch).toHaveBeenNthCalledWith(5, 'http://127.0.0.1:8651/api/jobs/job-1/run', expect.objectContaining({ method: 'POST' }))
    expect(global.fetch).toHaveBeenNthCalledWith(6, 'http://127.0.0.1:8651/api/jobs/job-1', expect.objectContaining({ method: 'DELETE' }))
  })

  it('requires the cron capability', async () => {
    mockGet.mockResolvedValue(profileDoc({ capabilities: { runs: true, dashboard: true, cron: false, models: true, tools: true, files: true, terminal: true } }))

    const { GET } = await import('@/app/api/v1/admin/hermes/profiles/[orgId]/jobs/route')
    const res = await GET(new NextRequest('http://localhost/api/v1/admin/hermes/profiles/org-a/jobs'), {
      params: Promise.resolve({ orgId: 'org-a' }),
    })

    expect(res.status).toBe(403)
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
