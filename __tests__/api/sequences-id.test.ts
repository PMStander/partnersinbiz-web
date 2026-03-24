// __tests__/api/sequences-id.test.ts
import { NextRequest } from 'next/server'

const mockGet = jest.fn()
const mockUpdate = jest.fn()
const mockDoc = jest.fn()
const mockCollection = jest.fn()

jest.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: mockCollection },
}))
jest.mock('@/lib/auth/middleware', () => ({
  withAuth: (_role: string, handler: Function) => handler,
}))

process.env.AI_API_KEY = 'test-key'
const authHeader = { Authorization: 'Bearer test-key' }
const params = { params: Promise.resolve({ id: 'seq1' }) }

beforeEach(() => {
  jest.clearAllMocks()
  mockDoc.mockReturnValue({ get: mockGet, update: mockUpdate })
  mockCollection.mockReturnValue({ doc: mockDoc })
})

describe('GET /api/v1/sequences/[id]', () => {
  it('returns a sequence', async () => {
    mockGet.mockResolvedValue({ exists: true, id: 'seq1', data: () => ({ name: 'Welcome', deleted: false }) })
    const { GET } = await import('@/app/api/v1/sequences/[id]/route')
    const req = new NextRequest('http://localhost/api/v1/sequences/seq1', { headers: authHeader })
    const res = await GET(req, params)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.id).toBe('seq1')
  })

  it('returns 404 for missing sequence', async () => {
    mockGet.mockResolvedValue({ exists: false })
    const { GET } = await import('@/app/api/v1/sequences/[id]/route')
    const req = new NextRequest('http://localhost/api/v1/sequences/none', { headers: authHeader })
    const res = await GET(req, params)
    expect(res.status).toBe(404)
  })
})

describe('PUT /api/v1/sequences/[id]', () => {
  it('updates a sequence', async () => {
    mockGet.mockResolvedValue({ exists: true, id: 'seq1', data: () => ({ name: 'Old', deleted: false }) })
    mockUpdate.mockResolvedValue({})
    const { PUT } = await import('@/app/api/v1/sequences/[id]/route')
    const req = new NextRequest('http://localhost/api/v1/sequences/seq1', {
      method: 'PUT',
      headers: { ...authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'New' }),
    })
    const res = await PUT(req, params)
    expect(res.status).toBe(200)
  })
})

describe('DELETE /api/v1/sequences/[id]', () => {
  it('soft-deletes a sequence', async () => {
    mockGet.mockResolvedValue({ exists: true, id: 'seq1', data: () => ({ name: 'Welcome', deleted: false }) })
    mockUpdate.mockResolvedValue({})
    const { DELETE } = await import('@/app/api/v1/sequences/[id]/route')
    const req = new NextRequest('http://localhost/api/v1/sequences/seq1', { method: 'DELETE', headers: authHeader })
    const res = await DELETE(req, params)
    expect(res.status).toBe(200)
  })
})
