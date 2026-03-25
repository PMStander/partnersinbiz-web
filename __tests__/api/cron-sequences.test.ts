// __tests__/api/cron-sequences.test.ts
import { NextRequest } from 'next/server'

const mockGet = jest.fn()
const mockAdd = jest.fn()
const mockUpdate = jest.fn()
const mockDoc = jest.fn()
const mockCollection = jest.fn()
const mockWhere = jest.fn()
const mockOrderBy = jest.fn()
const mockResendSend = jest.fn()

jest.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: mockCollection },
}))
jest.mock('@/lib/email/resend', () => ({
  getResendClient: jest.fn(() => ({ emails: { send: mockResendSend } })),
  FROM_ADDRESS: 'peet@partnersinbiz.online',
}))

process.env.CRON_SECRET = 'cron-secret'

beforeEach(() => {
  jest.clearAllMocks()
  const query = { where: mockWhere, orderBy: mockOrderBy, get: mockGet }
  mockWhere.mockReturnValue(query)
  mockOrderBy.mockReturnValue(query)
  mockDoc.mockReturnValue({ get: mockGet, update: mockUpdate })
  mockCollection.mockImplementation(() => ({
    where: mockWhere,
    orderBy: mockOrderBy,
    get: mockGet,
    add: mockAdd,
    doc: mockDoc,
  }))
})

describe('GET /api/cron/sequences', () => {
  it('rejects missing CRON_SECRET', async () => {
    jest.resetModules()
    const { GET } = await import('@/app/api/cron/sequences/route')
    const req = new NextRequest('http://localhost/api/cron/sequences')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it('processes due enrollments and sends emails', async () => {
    jest.resetModules()
    const dueEnrollment = {
      id: 'e1',
      data: () => ({
        sequenceId: 'seq1',
        contactId: 'c1',
        currentStep: 0,
        status: 'active',
        nextSendAt: { toDate: () => new Date(Date.now() - 1000) },
      }),
    }
    const seqData = {
      name: 'Welcome',
      steps: [
        { stepNumber: 1, delayDays: 0, subject: 'Step 1', bodyHtml: '<p>Hello</p>', bodyText: 'Hello' },
        { stepNumber: 2, delayDays: 3, subject: 'Step 2', bodyHtml: '<p>Follow</p>', bodyText: 'Follow' },
      ],
    }
    const contactData = { name: 'Alice', email: 'alice@example.com' }

    mockGet
      .mockResolvedValueOnce({ docs: [dueEnrollment] })
      .mockResolvedValueOnce({ exists: true, data: () => seqData })
      .mockResolvedValueOnce({ exists: true, data: () => contactData })

    mockResendSend.mockResolvedValue({ data: { id: 'resend-1' }, error: null })
    mockAdd.mockResolvedValue({ id: 'email-doc-1' })
    mockUpdate.mockResolvedValue({})

    const { GET } = await import('@/app/api/cron/sequences/route')
    const req = new NextRequest('http://localhost/api/cron/sequences', {
      headers: { Authorization: 'Bearer cron-secret' },
    })
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.processed).toBe(1)
    expect(mockResendSend).toHaveBeenCalledTimes(1)
  })

  it('marks enrollment completed when on last step', async () => {
    jest.resetModules()
    const dueEnrollment = {
      id: 'e1',
      data: () => ({
        sequenceId: 'seq1',
        contactId: 'c1',
        currentStep: 0,
        status: 'active',
        nextSendAt: { toDate: () => new Date(Date.now() - 1000) },
      }),
    }
    const seqData = {
      name: 'Welcome',
      steps: [{ stepNumber: 1, delayDays: 0, subject: 'Only Step', bodyHtml: '<p>Done</p>', bodyText: 'Done' }],
    }
    const contactData = { name: 'Bob', email: 'bob@example.com' }

    mockGet
      .mockResolvedValueOnce({ docs: [dueEnrollment] })
      .mockResolvedValueOnce({ exists: true, data: () => seqData })
      .mockResolvedValueOnce({ exists: true, data: () => contactData })

    mockResendSend.mockResolvedValue({ data: { id: 'r2' }, error: null })
    mockAdd.mockResolvedValue({ id: 'email-doc-2' })
    mockUpdate.mockResolvedValue({})

    const { GET } = await import('@/app/api/cron/sequences/route')
    const req = new NextRequest('http://localhost/api/cron/sequences', {
      headers: { Authorization: 'Bearer cron-secret' },
    })
    await GET(req)
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed' }))
  })
})
