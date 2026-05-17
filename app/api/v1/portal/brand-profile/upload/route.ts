import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import crypto from 'crypto'
import { adminDb, getAdminApp } from '@/lib/firebase/admin'
import { withPortalAuthAndRole } from '@/lib/auth/portal-middleware'
import { apiError, apiSuccess } from '@/lib/api/response'

export const dynamic = 'force-dynamic'

const MAX_FILE_SIZE = 8 * 1024 * 1024
const ALLOWED_FOLDERS = new Set(['brands/logos', 'brands/banners'])

export const POST = withPortalAuthAndRole('member', async (req: NextRequest, uid, orgId) => {
  const formData = await req.formData().catch(() => null)
  if (!formData) return apiError('Invalid form data', 400)

  const file = formData.get('file') as File | null
  if (!file) return apiError('No file provided', 400)
  if (!file.type.startsWith('image/')) return apiError('Only image uploads are supported', 400)
  if (file.size > MAX_FILE_SIZE) return apiError('Image is too large. Maximum size is 8MB.', 413)

  const requestedFolder = (formData.get('folder') as string) || 'brands/logos'
  const folder = ALLOWED_FOLDERS.has(requestedFolder) ? requestedFolder : 'brands/logos'
  const ext = file.name.split('.').pop() ?? 'bin'
  const filename = `${folder}/${orgId}/${Date.now()}-${crypto.randomUUID()}.${ext}`

  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)

  try {
    const bucket = getStorage(getAdminApp()).bucket()
    const fileRef = bucket.file(filename)
    const downloadToken = crypto.randomUUID()

    await fileRef.save(buffer, {
      metadata: {
        contentType: file.type,
        metadata: { firebaseStorageDownloadTokens: downloadToken },
      },
    })

    const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(filename)}?alt=media&token=${downloadToken}`

    const docRef = await adminDb.collection('uploads').add({
      orgId,
      name: file.name,
      storagePath: filename,
      url: publicUrl,
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
      folder,
      relatedTo: { type: 'organization', id: orgId },
      createdBy: uid,
      createdByType: 'client',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      deleted: false,
    })

    return apiSuccess({ id: docRef.id, url: publicUrl, name: file.name, mimeType: file.type, size: file.size })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[portal/brand-profile/upload] Firebase Storage error:', message)
    return apiError(`Storage error: ${message}`, 500)
  }
})
