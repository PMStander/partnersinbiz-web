import { getStorage } from 'firebase-admin/storage'
import { getAdminApp } from '@/lib/firebase/admin'
import crypto from 'crypto'

export async function uploadMediaToStorage(
  buffer: Buffer,
  mimeType: string,
  orgId: string,
  originalFilename: string,
): Promise<{ publicUrl: string; storagePath: string }> {
  const ext = (originalFilename.split('.').pop() ?? 'bin').toLowerCase().split('?')[0]
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
  try {
    await bucket.file(storagePath).delete()
  } catch (error) {
    // Ignore "not found" errors, re-throw others
    if (error instanceof Error && error.message.includes('No such object')) {
      return
    }
    throw error
  }
}
