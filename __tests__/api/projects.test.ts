import { NextRequest } from 'next/server'

type MockUser = { uid: string; role: 'admin'; orgId: string }
type MockHandler = (req: NextRequest, user: MockUser, ctx?: unknown) => Promise<Response>
type ProjectResponse = { data: Array<{ id: string }> }

const mockAdd = jest.fn()
const mockCollection = jest.fn()
const mockOrgWhere = jest.fn()
const mockOrgLimit = jest.fn()
const mockOrgGet = jest.fn()
const mockProjectWhere = jest.fn()
const mockProjectOrderBy = jest.fn()
const mockProjectGet = jest.fn()

jest.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: mockCollection },
}))

jest.mock('@/lib/api/auth', () => ({
  withAuth: (_role: string, handler: MockHandler) => async (req: NextRequest, ctx?: unknown) =>
    handler(req, { uid: 'admin-1', role: 'admin', orgId: 'platform' }, ctx),
}))

jest.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    serverTimestamp: jest.fn(() => 'SERVER_TIMESTAMP'),
  },
}))

beforeEach(() => {
  jest.clearAllMocks()

  const orgQuery = {
    limit: mockOrgLimit,
    get: mockOrgGet,
  }
  mockOrgWhere.mockReturnValue(orgQuery)
  mockOrgLimit.mockReturnValue(orgQuery)

  const scopedProjectQuery = {
    get: mockProjectGet,
    orderBy: mockProjectOrderBy,
  }
  const projectCollection = {
    add: mockAdd,
    where: mockProjectWhere,
    orderBy: mockProjectOrderBy,
    get: mockProjectGet,
  }
  mockProjectWhere.mockReturnValue(scopedProjectQuery)
  mockProjectOrderBy.mockReturnValue(scopedProjectQuery)

  mockCollection.mockImplementation((name: string) => {
    if (name === 'organizations') return { where: mockOrgWhere }
    if (name === 'projects') return projectCollection
    throw new Error(`Unexpected collection: ${name}`)
  })
})

describe('GET /api/v1/projects', () => {
  it('lists client workspace projects by org slug without requiring a Firestore composite index', async () => {
    mockOrgGet.mockResolvedValue({
      empty: false,
      docs: [{ id: 'org-covalonic', data: () => ({ name: 'Covalonic' }) }],
    })
    mockProjectGet.mockResolvedValue({
      docs: [
        { id: 'old', data: () => ({ name: 'Older Project', createdAt: { seconds: 10 } }) },
        { id: 'new', data: () => ({ name: 'Newer Project', createdAt: { seconds: 20 } }) },
      ],
    })

    const { GET } = await import('@/app/api/v1/projects/route')
    const req = new NextRequest('http://localhost/api/v1/projects?orgSlug=covalonic')
    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(mockProjectWhere).toHaveBeenCalledWith('orgId', '==', 'org-covalonic')
    expect(mockProjectOrderBy).not.toHaveBeenCalled()

    const body = await res.json() as ProjectResponse
    expect(body.data.map((project) => project.id)).toEqual(['new', 'old'])
  })
})

describe('POST /api/v1/projects', () => {
  it('links a project created inside a client workspace to that client org', async () => {
    mockOrgGet.mockResolvedValue({
      empty: false,
      docs: [{ id: 'org-covalonic', data: () => ({ name: 'Covalonic' }) }],
    })
    mockAdd.mockResolvedValue({ id: 'project-1' })

    const { POST } = await import('@/app/api/v1/projects/route')
    const req = new NextRequest('http://localhost/api/v1/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Website rebuild',
        orgSlug: 'covalonic',
        status: 'discovery',
      }),
    })

    const res = await POST(req)

    expect(res.status).toBe(201)
    expect(mockAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Website rebuild',
        orgId: 'org-covalonic',
        clientId: 'org-covalonic',
      }),
    )
  })
})
