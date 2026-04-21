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

  const bucket = getStorage(getAdminApp()).bucket()
  const file = bucket.file(storagePath)
  await file.save(buffer, { metadata: { contentType: mimeType } })
  await file.makePublic()

  const publicUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`
  return { publicUrl, storagePath }
}

export async function deleteMediaFromStorage(storagePath: string): Promise<void> {
  const bucket = getStorage(getAdminApp()).bucket()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (bucket.file(storagePath) as any).delete({ ignoreNotFound: true })
}
