// app/api/v1/social/media/upload/route.ts
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { withTenant } from '@/lib/api/tenant'
import { apiSuccess, apiError } from '@/lib/api/response'
import { uploadMediaToStorage } from '@/lib/social/storage'
import type { MediaType, MediaStatus } from '@/lib/social/providers'

export const dynamic = 'force-dynamic'

const MAX_SIZE_BYTES = 512 * 1024 * 1024
const ALLOWED_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'video/mp4', 'video/quicktime',
]

export const POST = withAuth('admin', withTenant(async (req, user, orgId) => {
  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return apiError('Request must be multipart/form-data')
  }

  const file = formData.get('file') as File | null
  if (!file) return apiError('file field is required')
  if (!ALLOWED_TYPES.includes(file.type)) {
    return apiError(`Unsupported file type: ${file.type}. Allowed: ${ALLOWED_TYPES.join(', ')}`)
  }
  if (file.size > MAX_SIZE_BYTES) {
    return apiError(`File exceeds 512MB limit (${(file.size / 1024 / 1024).toFixed(1)}MB)`)
  }

  const altText = (formData.get('altText') as string | null) ?? ''
  const buffer = Buffer.from(await file.arrayBuffer())

  const type: MediaType = file.type.startsWith('video/')
    ? 'video'
    : file.type === 'image/gif'
    ? 'gif'
    : 'image'

  const { publicUrl, storagePath } = await uploadMediaToStorage(buffer, file.type, orgId, file.name)

  const doc = {
    orgId,
    originalUrl: publicUrl,
    originalFilename: file.name,
    originalMimeType: file.type,
    originalSize: file.size,
    status: 'ready' as MediaStatus,
    variants: {},
    thumbnailUrl: publicUrl,
    type,
    width: 0,
    height: 0,
    duration: null,
    altText,
    storagePath,
    usedInPosts: [],
    uploadedBy: user.uid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }

  const docRef = await adminDb.collection('social_media').add(doc)

  return apiSuccess({ id: docRef.id, url: publicUrl, type, mimeType: file.type }, 201)
}))
