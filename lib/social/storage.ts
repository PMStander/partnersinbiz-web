import { getStorage } from 'firebase-admin/storage'
import { getAdminApp } from '@/lib/firebase/admin'
import crypto from 'crypto'

export async function uploadMediaToStorage(
  buffer: Buffer,
  mimeType: string,
  orgId: string,
  originalFilename: string,
): Promise<{ publicUrl: string; storagePath: string }> {
  const rawExt = (originalFilename.split('.').pop() ?? 'bin').toLowerCase().replace(/[^a-z0-9]/g, '')
  const ext = rawExt || 'bin'
  const id = crypto.randomBytes(12).toString('hex')
  const storagePath = `social-media/${orgId}/${id}.${ext}`

  // Bake a permanent Firebase download token into the object metadata at upload
  // time. `bucket.makePublic()` doesn't work on uniform-bucket-level-access
  // buckets (the security default), so use the same download-token scheme the
  // Firebase client SDK's getDownloadURL() uses — tokens never expire, the URL
  // is shareable, no per-request signing.
  const downloadToken = crypto.randomUUID()

  const bucket = getStorage(getAdminApp()).bucket()
  const file = bucket.file(storagePath)
  await file.save(buffer, {
    metadata: {
      contentType: mimeType,
      metadata: { firebaseStorageDownloadTokens: downloadToken },
    },
  })

  const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(storagePath)}?alt=media&token=${downloadToken}`
  return { publicUrl, storagePath }
}

export async function deleteMediaFromStorage(storagePath: string): Promise<void> {
  const bucket = getStorage(getAdminApp()).bucket()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (bucket.file(storagePath) as any).delete({ ignoreNotFound: true })
}
