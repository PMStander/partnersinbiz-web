// __tests__/app/api/v1/ads/creatives/upload-url.test.ts
import { POST } from '@/app/api/v1/ads/creatives/upload-url/route'

jest.mock('@/lib/api/auth', () => ({ withAuth: (_r: string, h: any) => h }))
jest.mock('@/lib/ads/creatives/storage', () => ({
  sourceStoragePath: jest.fn(
    ({ orgId, creativeId, ext }: { orgId: string; creativeId: string; ext: string }) =>
      `orgs/${orgId}/ad_creatives/${creativeId}/source.${ext}`,
  ),
  signedUploadUrl: jest.fn().mockResolvedValue({
    uploadUrl: 'https://storage.googleapis.com/signed?token=x',
    expiresAt: Date.now() + 900_000,
  }),
  extensionFromMime: jest.fn((mime: string) => (mime === 'image/jpeg' ? 'jpg' : 'mp4')),
  creativeTypeFromMime: jest.fn((mime: string) => {
    if (mime.startsWith('image/')) return 'image'
    if (mime.startsWith('video/')) return 'video'
    return null
  }),
  publicReadUrl: jest.fn((path: string) => `https://storage.googleapis.com/bucket/${path}`),
}))
jest.mock('@/lib/ads/creatives/store', () => ({
  createCreative: jest.fn().mockResolvedValue({ id: 'crv_test' }),
}))

const storageMock = jest.requireMock('@/lib/ads/creatives/storage')
const storeMock = jest.requireMock('@/lib/ads/creatives/store')

beforeEach(() => jest.clearAllMocks())

function makeReq(body: object, orgId?: string) {
  return new Request('http://x', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(orgId ? { 'X-Org-Id': orgId } : {}),
    },
    body: JSON.stringify(body),
  }) as any
}

describe('POST /api/v1/ads/creatives/upload-url', () => {
  it('returns creativeId + uploadUrl on happy path', async () => {
    const res = await POST(
      makeReq({ name: 'Hero image', mimeType: 'image/jpeg', fileSize: 500_000 }, 'org_1'),
      { uid: 'u1' } as any,
      {} as any,
    )
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.creativeId).toMatch(/^crv_/)
    expect(body.data.uploadUrl).toContain('storage.googleapis.com')
    expect(body.data.expiresAt).toBeGreaterThan(Date.now())
    expect(storeMock.createCreative).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: 'org_1',
        input: expect.objectContaining({ status: 'UPLOADING', type: 'image' }),
      }),
    )
  })

  it('returns 400 if name is missing', async () => {
    const res = await POST(
      makeReq({ mimeType: 'image/jpeg', fileSize: 500_000 }, 'org_1'),
      { uid: 'u1' } as any,
      {} as any,
    )
    expect(res.status).toBe(400)
    expect(storeMock.createCreative).not.toHaveBeenCalled()
  })

  it('returns 400 if mimeType is unsupported (application/pdf)', async () => {
    storageMock.creativeTypeFromMime.mockReturnValueOnce(null)
    const res = await POST(
      makeReq({ name: 'doc', mimeType: 'application/pdf', fileSize: 500_000 }, 'org_1'),
      { uid: 'u1' } as any,
      {} as any,
    )
    expect(res.status).toBe(400)
  })

  it('returns 400 if fileSize exceeds 100 MB', async () => {
    const res = await POST(
      makeReq({ name: 'big', mimeType: 'image/jpeg', fileSize: 101 * 1024 * 1024 }, 'org_1'),
      { uid: 'u1' } as any,
      {} as any,
    )
    expect(res.status).toBe(400)
  })

  it('returns 400 if X-Org-Id header is missing', async () => {
    const res = await POST(
      makeReq({ name: 'Hero image', mimeType: 'image/jpeg', fileSize: 500_000 }),
      { uid: 'u1' } as any,
      {} as any,
    )
    expect(res.status).toBe(400)
  })
})
