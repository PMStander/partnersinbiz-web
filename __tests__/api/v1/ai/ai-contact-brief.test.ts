import { NextRequest } from 'next/server'

const mockGet = jest.fn()
const mockDoc = jest.fn()
const mockCollection = jest.fn()
const mockWhere = jest.fn()
const mockOrderBy = jest.fn()
const mockLimit = jest.fn()
const mockGenerateText = jest.fn()

jest.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: mockCollection, doc: mockDoc },
}))
jest.mock('@/lib/api/auth', () => ({
  withAuth: (_role: string, handler: Function) =>
    (req: any, context?: any) => handler(req, { uid: 'ai-agent', role: 'ai' }, context),
}))
jest.mock('@/lib/ai/client', () => ({
  BRIEF_MODEL: 'anthropic/claude-haiku-4.5',
}))
jest.mock('ai', () => ({
  generateText: mockGenerateText,
}))

process.env.AI_API_KEY = 'test-key'

type Params = { params: Promise<{ id: string }> }

beforeEach(() => {
  jest.clearAllMocks()
  const query = { where: mockWhere, orderBy: mockOrderBy, limit: mockLimit, get: mockGet }
  mockWhere.mockReturnValue(query)
  mockOrderBy.mockReturnValue(query)
  mockLimit.mockReturnValue(query)
  mockCollection.mockReturnValue(query)
})

describe('GET /api/v1/ai/contact-brief/[id]', () => {
  it('returns 404 when contact not found', async () => {
    mockDoc.mockReturnValue({ get: jest.fn().mockResolvedValue({ exists: false }) })
    const { GET } = await import('@/app/api/v1/ai/contact-brief/[id]/route')
    const req = new NextRequest('http://localhost/api/v1/ai/contact-brief/c1')
    const ctx: Params = { params: Promise.resolve({ id: 'c1' }) }
    const res = await GET(req, ctx)
    expect(res.status).toBe(404)
  })

  it('returns AI-generated brief for an existing contact', async () => {
    mockDoc.mockReturnValue({
      get: jest.fn().mockResolvedValue({
        exists: true,
        data: () => ({ name: 'Alice Smith', email: 'alice@example.com', company: 'Acme', stage: 'proposal' }),
      }),
    })
    mockGet
      .mockResolvedValueOnce({ docs: [
        { data: () => ({ type: 'email_sent', note: 'Sent intro email', createdAt: null }) },
      ]})
      .mockResolvedValueOnce({ docs: [
        { data: () => ({ subject: 'Intro', bodyText: 'Hello!', status: 'opened', createdAt: null }) },
      ]})
      .mockResolvedValueOnce({ docs: [
        { data: () => ({ name: 'Acme website', value: 5000, stage: 'proposal' }) },
      ]})

    mockGenerateText.mockResolvedValue({ text: 'Alice Smith is a prospect at Acme in proposal stage.' })

    const { GET } = await import('@/app/api/v1/ai/contact-brief/[id]/route')
    const req = new NextRequest('http://localhost/api/v1/ai/contact-brief/c1')
    const ctx: Params = { params: Promise.resolve({ id: 'c1' }) }
    const res = await GET(req, ctx)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.brief).toBe('Alice Smith is a prospect at Acme in proposal stage.')
    expect(mockGenerateText).toHaveBeenCalledTimes(1)
  })
})
