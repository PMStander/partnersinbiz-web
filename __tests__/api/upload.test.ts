import { NextRequest } from 'next/server'

type MockUser = { uid: string; role: 'admin'; orgId: string }
type MockHandler = (req: NextRequest, user: MockUser, ctx?: unknown) => Promise<Response>

const mockAdd = jest.fn()
const mockSave = jest.fn()
const mockMakePublic = jest.fn()
const mockFile = jest.fn()
const mockBucket = jest.fn()
const mockGetStorage = jest.fn()

jest.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: jest.fn(() => ({ add: mockAdd })),
  },
  getAdminApp: jest.fn(() => ({})),
}))

jest.mock('@/lib/api/auth', () => ({
  withAuth: (_role: string, handler: MockHandler) => async (req: NextRequest, ctx?: unknown) =>
    handler(req, { uid: 'admin-1', role: 'admin', orgId: 'platform' }, ctx),
}))

jest.mock('@/lib/api/actor', () => ({
  actorFrom: jest.fn(() => ({ createdBy: 'admin-1', updatedBy: 'admin-1' })),
}))

jest.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    serverTimestamp: jest.fn(() => 'SERVER_TIMESTAMP'),
  },
}))

jest.mock('firebase-admin/storage', () => ({
  getStorage: mockGetStorage,
}))

beforeEach(() => {
  jest.clearAllMocks()
  mockSave.mockResolvedValue(undefined)
  mockMakePublic.mockResolvedValue(undefined)
  mockFile.mockReturnValue({ save: mockSave, makePublic: mockMakePublic })
  mockBucket.mockReturnValue({ name: 'test-bucket', file: mockFile })
  mockGetStorage.mockReturnValue({ bucket: mockBucket })
  mockAdd.mockResolvedValue({ id: 'upload-1' })
})

describe('POST /api/v1/upload', () => {
  it('makes uploaded brand files public before returning their URL', async () => {
    const { POST } = await import('@/app/api/v1/upload/route')
    const form = new FormData()
    form.append('folder', 'brands/logos')
    form.append('file', new File(['fake-logo'], 'logo.png', { type: 'image/png' }))

    const req = new NextRequest('http://localhost/api/v1/upload', {
      method: 'POST',
      body: form,
    })

    const res = await POST(req)

    expect(res.status).toBe(200)
    expect(mockSave).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.objectContaining({
        metadata: expect.objectContaining({ contentType: 'image/png' }),
      }),
    )

    const body = await res.json()
    expect(body.data.url).toMatch(/^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/test-bucket\/o\/brands%2Flogos%2F/)
  })
})
