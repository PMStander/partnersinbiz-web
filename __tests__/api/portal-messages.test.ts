// __tests__/api/portal-messages.test.ts
import { NextRequest } from 'next/server'

const mockGet = jest.fn()
const mockAdd = jest.fn()
const mockDoc = jest.fn()
const mockCollection = jest.fn()
const mockWhere = jest.fn()
const mockOrderBy = jest.fn()

jest.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: mockCollection },
  adminAuth: { verifySessionCookie: jest.fn().mockResolvedValue({ uid: 'user-1' }) },
}))
jest.mock('@/lib/auth/portal-middleware', () => ({
  withPortalAuth: (handler: Function) => (req: NextRequest, ...args: any[]) => handler(req, 'user-1', ...args),
}))

beforeEach(() => {
  jest.clearAllMocks()
  const query = { where: mockWhere, orderBy: mockOrderBy, get: mockGet }
  mockWhere.mockReturnValue(query)
  mockOrderBy.mockReturnValue(query)
  mockDoc.mockReturnValue({ get: mockGet })
  mockCollection.mockImplementation(() => ({
    where: mockWhere,
    orderBy: mockOrderBy,
    doc: mockDoc,
    add: mockAdd,
  }))
})

describe('GET /api/v1/portal/messages', () => {
  it('returns messages for user enquiry', async () => {
    mockGet
      .mockResolvedValueOnce({ exists: true, id: 'enq1', data: () => ({ userId: 'user-1' }) })
      .mockResolvedValueOnce({
        docs: [{ id: 'msg1', data: () => ({ text: 'Hello', enquiryId: 'enq1', createdAt: null }) }],
      })
    const { GET } = await import('@/app/api/v1/portal/messages/route')
    const req = new NextRequest('http://localhost/api/v1/portal/messages?enquiryId=enq1', {
      headers: { Cookie: '__session=valid' },
    })
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toHaveLength(1)
  })

  it('returns 400 when no enquiryId provided', async () => {
    const { GET } = await import('@/app/api/v1/portal/messages/route')
    const req = new NextRequest('http://localhost/api/v1/portal/messages', {
      headers: { Cookie: '__session=valid' },
    })
    const res = await GET(req)
    expect(res.status).toBe(400)
  })

  it('returns 403 for enquiry owned by another user', async () => {
    mockGet.mockResolvedValue({ exists: true, id: 'enq1', data: () => ({ userId: 'other-user' }) })
    const { GET } = await import('@/app/api/v1/portal/messages/route')
    const req = new NextRequest('http://localhost/api/v1/portal/messages?enquiryId=enq1', {
      headers: { Cookie: '__session=valid' },
    })
    const res = await GET(req)
    expect(res.status).toBe(403)
  })
})

describe('POST /api/v1/portal/messages', () => {
  it('creates a message and activity', async () => {
    mockGet.mockResolvedValue({ exists: true, id: 'enq1', data: () => ({ userId: 'user-1', name: 'Alice' }) })
    mockAdd.mockResolvedValue({ id: 'msg-new' })
    const { POST } = await import('@/app/api/v1/portal/messages/route')
    const req = new NextRequest('http://localhost/api/v1/portal/messages', {
      method: 'POST',
      headers: { Cookie: '__session=valid', 'Content-Type': 'application/json' },
      body: JSON.stringify({ enquiryId: 'enq1', text: 'Can we schedule a call?' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(201)
    expect(mockAdd).toHaveBeenCalledTimes(1) // just the message (no contactId on enquiry)
  })

  it('returns 400 when text is missing', async () => {
    const { POST } = await import('@/app/api/v1/portal/messages/route')
    const req = new NextRequest('http://localhost/api/v1/portal/messages', {
      method: 'POST',
      headers: { Cookie: '__session=valid', 'Content-Type': 'application/json' },
      body: JSON.stringify({ enquiryId: 'enq1' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })
})
