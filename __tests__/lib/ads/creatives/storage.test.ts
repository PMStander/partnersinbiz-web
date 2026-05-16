import {
  sourceStoragePath,
  previewStoragePath,
  publicReadUrl,
  extensionFromMime,
  creativeTypeFromMime,
  signedUploadUrl,
} from '@/lib/ads/creatives/storage'

jest.mock('firebase-admin/storage', () => {
  const getSignedUrl = jest.fn().mockResolvedValue(['https://signed/upload?token=x'])
  return {
    getStorage: () => ({
      bucket: () => ({
        file: () => ({ getSignedUrl }),
      }),
    }),
    __mockGetSignedUrl: getSignedUrl,
  }
})

describe('storage path helpers', () => {
  it('sourceStoragePath produces orgs/<orgId>/ad_creatives/<id>/source.<ext>', () => {
    expect(sourceStoragePath({ orgId: 'org_1', creativeId: 'crv_1', ext: 'jpg' })).toBe(
      'orgs/org_1/ad_creatives/crv_1/source.jpg',
    )
  })

  it('previewStoragePath is always .jpg', () => {
    expect(previewStoragePath({ orgId: 'org_1', creativeId: 'crv_1' })).toBe(
      'orgs/org_1/ad_creatives/crv_1/preview.jpg',
    )
  })

  it('publicReadUrl wraps in storage.googleapis.com pattern with bucket from env', () => {
    process.env.FIREBASE_STORAGE_BUCKET = 'my-bucket.appspot.com'
    expect(publicReadUrl('orgs/x/file.jpg')).toBe(
      'https://storage.googleapis.com/my-bucket.appspot.com/orgs/x/file.jpg',
    )
  })

  it('extensionFromMime covers common types', () => {
    expect(extensionFromMime('image/jpeg')).toBe('jpg')
    expect(extensionFromMime('image/png')).toBe('png')
    expect(extensionFromMime('image/webp')).toBe('webp')
    expect(extensionFromMime('video/mp4')).toBe('mp4')
    expect(extensionFromMime('video/quicktime')).toBe('mov')
    expect(extensionFromMime('image/gif')).toBe('gif')
  })

  it('creativeTypeFromMime returns image/video/null', () => {
    expect(creativeTypeFromMime('image/jpeg')).toBe('image')
    expect(creativeTypeFromMime('video/mp4')).toBe('video')
    expect(creativeTypeFromMime('application/pdf')).toBeNull()
  })

  it('signedUploadUrl returns v4 signed PUT URL and expiry', async () => {
    const r = await signedUploadUrl({ storagePath: 'orgs/x/file.jpg', contentType: 'image/jpeg' })
    expect(r.uploadUrl).toBe('https://signed/upload?token=x')
    expect(r.expiresAt).toBeGreaterThan(Date.now())
  })
})
