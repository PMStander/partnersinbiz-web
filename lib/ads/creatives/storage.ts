// lib/ads/creatives/storage.ts
import { getStorage } from 'firebase-admin/storage'
import type { AdCreativeType } from '@/lib/ads/types'

/** Canonical storage path for a creative's source asset. */
export function sourceStoragePath(args: { orgId: string; creativeId: string; ext: string }): string {
  return `orgs/${args.orgId}/ad_creatives/${args.creativeId}/source.${args.ext}`
}

/** Storage path for the auto-generated preview. */
export function previewStoragePath(args: { orgId: string; creativeId: string }): string {
  return `orgs/${args.orgId}/ad_creatives/${args.creativeId}/preview.jpg`
}

/** Public read URL pattern Firebase Storage uses. */
export function publicReadUrl(storagePath: string): string {
  const bucket = process.env.FIREBASE_STORAGE_BUCKET ?? 'partners-in-biz-85059.appspot.com'
  return `https://storage.googleapis.com/${bucket}/${encodeURI(storagePath)}`
}

/** Issue a signed PUT URL for browser upload. Valid for 15 minutes. */
export async function signedUploadUrl(args: {
  storagePath: string
  contentType: string
}): Promise<{ uploadUrl: string; expiresAt: number }> {
  const bucket = getStorage().bucket()
  const file = bucket.file(args.storagePath)
  const expiresInMs = 15 * 60 * 1000
  const expiresAt = Date.now() + expiresInMs
  const [uploadUrl] = await file.getSignedUrl({
    version: 'v4',
    action: 'write',
    expires: expiresAt,
    contentType: args.contentType,
  })
  return { uploadUrl, expiresAt }
}

export function extensionFromMime(mimeType: string): string {
  switch (mimeType) {
    case 'image/jpeg':
      return 'jpg'
    case 'image/png':
      return 'png'
    case 'image/webp':
      return 'webp'
    case 'video/mp4':
      return 'mp4'
    case 'video/quicktime':
      return 'mov'
    default:
      // Fall back to the MIME subtype (e.g. 'image/gif' → 'gif')
      return mimeType.split('/')[1] ?? 'bin'
  }
}

export function isImageMime(mimeType: string): boolean {
  return mimeType.startsWith('image/')
}

export function isVideoMime(mimeType: string): boolean {
  return mimeType.startsWith('video/')
}

export function creativeTypeFromMime(mimeType: string): AdCreativeType | null {
  if (isImageMime(mimeType)) return 'image'
  if (isVideoMime(mimeType)) return 'video'
  return null
}
