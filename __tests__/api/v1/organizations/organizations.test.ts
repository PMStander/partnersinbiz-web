// __tests__/api/v1/organizations/organizations.test.ts
import { NextRequest } from 'next/server'
import { GET, POST } from '@/app/api/v1/organizations/route'
import { GET as getById, PUT, DELETE } from '@/app/api/v1/organizations/[id]/route'

const AI_KEY = 'test-ai-key'
process.env.AI_API_KEY = AI_KEY
process.env.SESSION_COOKIE_NAME = '__session'

const mockGet = jest.fn()
const mockAdd = jest.fn()
const mockWhere = jest.fn()
const mockOrderBy = jest.fn()
const mockCollection = jest.fn()

jest.mock('@/lib/firebase/admin', () => ({
  adminAuth: {
    verifyIdToken: jest.fn(),
    verifySessionCookie: jest.fn(),
  },
  adminDb: { collection: (...args: unknown[]) => mockCollection(...args) },
}))

function adminReq(method = 'GET', body?: unknown, url = 'http://localhost/api/v1/organizations') {
  return new NextRequest(url, {
    method,
    headers: { authorization: `Bearer ${AI_KEY}`, 'x-org-id': 'default' },
    body: body ? JSON.stringify(body) : undefined,
  })
}

describe('GET /api/v1/organizations', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGet.mockResolvedValue({
      docs: [
        { id: 'org-1', data: () => ({ name: 'Lumen', slug: 'lumen', active: true, members: [{ userId: 'ai-agent', role: 'owner' }], description: '', logoUrl: '', website: '', createdBy: 'ai-agent', linkedClientId: '' }) },
      ],
    })
    mockWhere.mockReturnValue({ orderBy: mockOrderBy, get: mockGet })
    mockOrderBy.mockReturnValue({ get: mockGet })
    mockCollection.mockReturnValue({ where: mockWhere, orderBy: mockOrderBy, get: mockGet })
  })

  it('returns list of orgs the user is a member of', async () => {
    const res = await GET(adminReq())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(Array.isArray(body.data)).toBe(true)
  })

  it('returns 401 without auth', async () => {
    const req = new NextRequest('http://localhost/api/v1/organizations')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })
})

describe('POST /api/v1/organizations', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGet.mockResolvedValue({ empty: true, docs: [] })
    mockWhere.mockReturnValue({ get: mockGet })
    mockAdd.mockResolvedValue({ id: 'new-org-id' })
    mockCollection.mockReturnValue({ where: mockWhere, add: mockAdd, orderBy: mockOrderBy, get: mockGet })
    mockOrderBy.mockReturnValue({ get: mockGet })
  })

  it('creates an org and returns 201', async () => {
    const res = await POST(adminReq('POST', { name: 'Velox', description: 'Test org' }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.id).toBe('new-org-id')
  })

  it('returns 400 when name is missing', async () => {
    const res = await POST(adminReq('POST', { description: 'No name' }))
    expect(res.status).toBe(400)
  })

  it('returns 409 when slug already exists', async () => {
    mockGet.mockResolvedValue({ empty: false, docs: [{ id: 'existing-org' }] })
    mockWhere.mockReturnValue({ get: mockGet })
    mockCollection.mockReturnValue({ where: mockWhere, add: mockAdd, orderBy: mockOrderBy, get: mockGet })
    const res = await POST(adminReq('POST', { name: 'Velox' }))
    expect(res.status).toBe(409)
  })
})

describe('GET /api/v1/organizations/[id]', () => {
  const mockDocGet = jest.fn()
  const mockDoc = jest.fn()
  const mockUpdate = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    mockDocGet.mockResolvedValue({
      exists: true,
      id: 'org-1',
      data: () => ({
        name: 'Lumen', slug: 'lumen', active: true,
        members: [{ userId: 'ai-agent', role: 'owner' }],
        description: '', logoUrl: '', website: '', createdBy: 'ai-agent', linkedClientId: '',
      }),
    })
    mockDoc.mockReturnValue({ get: mockDocGet, update: mockUpdate })
    mockCollection.mockReturnValue({ doc: mockDoc, where: mockWhere, orderBy: mockOrderBy, get: mockGet, add: mockAdd })
  })

  it('returns org details', async () => {
    const res = await getById(adminReq('GET'), { params: Promise.resolve({ id: 'org-1' }) } as any)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.name).toBe('Lumen')
  })

  it('returns 404 when org does not exist', async () => {
    mockDocGet.mockResolvedValue({ exists: false })
    const res = await getById(adminReq('GET'), { params: Promise.resolve({ id: 'ghost' }) } as any)
    expect(res.status).toBe(404)
  })
})

describe('PUT /api/v1/organizations/[id]', () => {
  const mockDocGet = jest.fn()
  const mockDoc = jest.fn()
  const mockUpdate = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    mockUpdate.mockResolvedValue(undefined)
    mockDocGet.mockResolvedValue({
      exists: true,
      id: 'org-1',
      data: () => ({
        name: 'Lumen', slug: 'lumen', active: true,
        members: [{ userId: 'ai-agent', role: 'owner' }],
        description: '', logoUrl: '', website: '', createdBy: 'ai-agent', linkedClientId: '',
      }),
    })
    mockDoc.mockReturnValue({ get: mockDocGet, update: mockUpdate })
    mockWhere.mockReturnValue({ get: jest.fn().mockResolvedValue({ empty: true }) })
    mockCollection.mockReturnValue({ doc: mockDoc, where: mockWhere, orderBy: mockOrderBy, get: mockGet })
  })

  it('updates org and returns 200', async () => {
    const res = await PUT(adminReq('PUT', { name: 'Lumen Updated' }), { params: Promise.resolve({ id: 'org-1' }) } as any)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.updated).toBe(true)
  })

  it('returns 404 when org does not exist', async () => {
    mockDocGet.mockResolvedValue({ exists: false })
    const res = await PUT(adminReq('PUT', { name: 'X' }), { params: Promise.resolve({ id: 'ghost' }) } as any)
    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/v1/organizations/[id]', () => {
  const mockDocGet = jest.fn()
  const mockDoc = jest.fn()
  const mockUpdate = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    mockUpdate.mockResolvedValue(undefined)
    mockDocGet.mockResolvedValue({
      exists: true,
      id: 'org-1',
      data: () => ({
        name: 'Lumen', slug: 'lumen', active: true,
        members: [{ userId: 'ai-agent', role: 'owner' }],
        description: '', logoUrl: '', website: '', createdBy: 'ai-agent', linkedClientId: '',
      }),
    })
    mockDoc.mockReturnValue({ get: mockDocGet, update: mockUpdate })
    mockCollection.mockReturnValue({ doc: mockDoc })
  })

  it('soft-deletes org and returns 200', async () => {
    const res = await DELETE(adminReq('DELETE'), { params: Promise.resolve({ id: 'org-1' }) } as any)
    expect(res.status).toBe(200)
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ active: false }))
  })

  it('returns 404 when org does not exist', async () => {
    mockDocGet.mockResolvedValue({ exists: false })
    const res = await DELETE(adminReq('DELETE'), { params: Promise.resolve({ id: 'ghost' }) } as any)
    expect(res.status).toBe(404)
  })
})
