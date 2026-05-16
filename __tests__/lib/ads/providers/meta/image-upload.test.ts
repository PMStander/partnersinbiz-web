// __tests__/lib/ads/providers/meta/image-upload.test.ts
import { uploadImageFromUrl } from '@/lib/ads/providers/meta/image-upload'

beforeEach(() => {
  global.fetch = jest.fn() as unknown as typeof fetch
})

describe('uploadImageFromUrl', () => {
  it('downloads the image, posts bytes to /adimages, returns image_hash', async () => {
    const imageBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]) // tiny JPEG header
    ;(global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => imageBytes.buffer,
        headers: { get: () => 'image/jpeg' },
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          images: { 'phase2_upload.jpg': { hash: 'abc123hash', url: 'https://meta-cdn/x' } },
        }),
      })

    const hash = await uploadImageFromUrl({
      adAccountId: 'act_42',
      accessToken: 'EAAO_long',
      sourceUrl: 'https://example.com/img.jpg',
    })

    expect(hash).toBe('abc123hash')
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe('https://example.com/img.jpg')
    const postUrl = (global.fetch as jest.Mock).mock.calls[1][0]
    expect(postUrl).toContain('https://graph.facebook.com/v25.0/act_42/adimages')
  })

  it('throws if download fails', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 404 })
    await expect(
      uploadImageFromUrl({
        adAccountId: 'act_42',
        accessToken: 'tok',
        sourceUrl: 'https://example.com/missing.jpg',
      }),
    ).rejects.toThrow(/download failed/i)
  })

  it('throws if Meta upload returns no hash', async () => {
    ;(global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(8),
        headers: { get: () => 'image/jpeg' },
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: { message: 'Invalid image' } }),
      })
    await expect(
      uploadImageFromUrl({
        adAccountId: 'act_42',
        accessToken: 'tok',
        sourceUrl: 'https://example.com/bad.jpg',
      }),
    ).rejects.toThrow(/Invalid image/)
  })
})
