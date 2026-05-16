// __tests__/app/api/v1/ads/creatives/finalize.test.ts
import { POST } from '@/app/api/v1/ads/creatives/[id]/finalize/route'

jest.mock('@/lib/api/auth', () => ({ withAuth: (_r: string, h: any) => h }))
jest.mock('@/lib/ads/creatives/store', () => ({
  getCreative: jest.fn(),
  updateCreative: jest.fn(),
}))
jest.mock('@/lib/ads/creatives/storage', () => ({
  previewStoragePath: jest.fn(
    ({ orgId, creativeId }: { orgId: string; creativeId: string }) =>
      `orgs/${orgId}/ad_creatives/${creativeId}/preview.jpg`,
  ),
  publicReadUrl: jest.fn(
    (path: string) => `https://storage.googleapis.com/bucket/${path}`,
  ),
}))
jest.mock('@/lib/ads/creatives/finalize', () => ({
  probeMetadata: jest.fn(),
  generatePreview: jest.fn(),
}))

const mockSave = jest.fn().mockResolvedValue(undefined)
const mockFile = jest.fn(() => ({ save: mockSave }))
const mockBucket = jest.fn(() => ({ file: mockFile }))
jest.mock('firebase-admin/storage', () => ({
  getStorage: jest.fn(() => ({ bucket: mockBucket })),
}))

const store = jest.requireMock('@/lib/ads/creatives/store')
const finalizeLib = jest.requireMock('@/lib/ads/creatives/finalize')

beforeEach(() => {
  jest.clearAllMocks()
  mockSave.mockResolvedValue(undefined)
})

const baseCreative = {
  id: 'crv_1',
  orgId: 'org_1',
  type: 'image',
  name: 'Hero',
  storagePath: 'orgs/org_1/ad_creatives/crv_1/source.jpg',
  sourceUrl: 'https://storage.googleapis.com/bucket/source.jpg',
  mimeType: 'image/jpeg',
  fileSize: 250_000,
  status: 'UPLOADING',
  platformRefs: {},
}

// Mock global fetch
const fetchSpy = jest.spyOn(global, 'fetch')

describe('POST /api/v1/ads/creatives/[id]/finalize', () => {
  it('image happy path: probes dimensions, generates and uploads preview, sets status READY', async () => {
    store.getCreative
      .mockResolvedValueOnce(baseCreative) // initial fetch
      .mockResolvedValueOnce({ ...baseCreative, status: 'READY', width: 1200, height: 628 }) // post-update
    store.updateCreative.mockResolvedValueOnce(undefined)

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(1024),
    } as any)
    finalizeLib.probeMetadata.mockResolvedValueOnce({ width: 1200, height: 628 })
    finalizeLib.generatePreview.mockResolvedValueOnce(Buffer.from('preview'))

    const res = await POST(
      new Request('http://x', { method: 'POST', headers: { 'X-Org-Id': 'org_1' } }) as any,
      {} as any,
      { params: Promise.resolve({ id: 'crv_1' }) },
    )
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.data.status).toBe('READY')
    expect(store.updateCreative).toHaveBeenCalledWith(
      'crv_1',
      expect.objectContaining({
        width: 1200,
        height: 628,
        status: 'READY',
        previewUrl: expect.stringContaining('preview.jpg'),
      }),
    )
    expect(mockSave).toHaveBeenCalled()
  })

  it('video happy path: returns placeholder dimensions and no preview', async () => {
    const videoCreative = { ...baseCreative, type: 'video', mimeType: 'video/mp4' }
    store.getCreative
      .mockResolvedValueOnce(videoCreative)
      .mockResolvedValueOnce({ ...videoCreative, status: 'READY', width: 0, height: 0, duration: 0 })
    store.updateCreative.mockResolvedValueOnce(undefined)

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(1024),
    } as any)
    finalizeLib.probeMetadata.mockResolvedValueOnce({ width: 0, height: 0, duration: 0 })
    finalizeLib.generatePreview.mockResolvedValueOnce(null)

    const res = await POST(
      new Request('http://x', { method: 'POST', headers: { 'X-Org-Id': 'org_1' } }) as any,
      {} as any,
      { params: Promise.resolve({ id: 'crv_1' }) },
    )
    expect(res.status).toBe(200)
    // No preview upload since generatePreview returns null
    expect(mockSave).not.toHaveBeenCalled()
    expect(store.updateCreative).toHaveBeenCalledWith(
      'crv_1',
      expect.objectContaining({ status: 'READY', previewUrl: undefined }),
    )
  })

  it('download error sets status FAILED and returns 500', async () => {
    store.getCreative.mockResolvedValueOnce(baseCreative)
    store.updateCreative.mockResolvedValueOnce(undefined)

    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 403,
    } as any)

    const res = await POST(
      new Request('http://x', { method: 'POST', headers: { 'X-Org-Id': 'org_1' } }) as any,
      {} as any,
      { params: Promise.resolve({ id: 'crv_1' }) },
    )
    expect(res.status).toBe(500)
    expect(store.updateCreative).toHaveBeenCalledWith(
      'crv_1',
      expect.objectContaining({ status: 'FAILED', lastError: expect.stringContaining('403') }),
    )
  })
})
