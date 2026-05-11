// app/api/v1/email-images/upload/route.ts
//
// Upload an image for use in email templates. Stored at
// `email-images/{orgId}/{uuid}.{ext}` in Firebase Storage with a baked-in
// download token so the resulting URL works without signed-URL plumbing.
//
// Multipart fields:
//   file       — required (image/jpeg | image/png | image/gif | image/webp)
//   orgId      — optional (resolved via session/scope when admin-scoped)
//   width      — optional client-measured pixel width
//   height     — optional client-measured pixel height
//   filename   — optional override for stored filename (otherwise file.name)
//
// SVG is rejected outright — XSS surface inside an email render. File size
// is checked against the Content-Length header BEFORE buffering the body.

import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { resolveOrgScope } from '@/lib/api/orgScope'
import { apiSuccess, apiError } from '@/lib/api/response'
import { FieldValue } from 'firebase-admin/firestore'
import { actorFrom } from '@/lib/api/actor'
import { getStorage } from 'firebase-admin/storage'
import { getAdminApp } from '@/lib/firebase/admin'
import crypto from 'crypto'
import type { ApiUser } from '@/lib/api/types'

export const dynamic = 'force-dynamic'

const MAX_BYTES = 5 * 1024 * 1024 // 5MB
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
const EXT_FOR_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
}

export const POST = withAuth('client', async (req: NextRequest, user: ApiUser) => {
  // Reject oversize requests BEFORE buffering. The browser-set Content-Length
  // includes the multipart overhead but it's a tight enough bound for an
  // early-exit. We still re-check the parsed file size below.
  const contentLengthHeader = req.headers.get('content-length')
  if (contentLengthHeader) {
    const cl = Number(contentLengthHeader)
    if (Number.isFinite(cl) && cl > MAX_BYTES + 64 * 1024) {
      return apiError(`File too large (max ${Math.round(MAX_BYTES / 1024 / 1024)}MB)`, 413)
    }
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return apiError('Invalid multipart body', 400)
  }

  const file = form.get('file')
  if (!(file instanceof Blob)) return apiError('file is required', 400)

  // Validate type FIRST — rejects SVG.
  const mime = (file.type || '').toLowerCase()
  if (!ALLOWED_MIME.has(mime)) {
    return apiError('Unsupported image type. Allowed: jpeg, png, gif, webp', 400)
  }

  if (file.size > MAX_BYTES) {
    return apiError(`File too large (max ${Math.round(MAX_BYTES / 1024 / 1024)}MB)`, 413)
  }

  const orgIdInput = typeof form.get('orgId') === 'string' ? (form.get('orgId') as string) : null
  const scope = resolveOrgScope(user, orgIdInput)
  if (!scope.ok) return apiError(scope.error, scope.status)
  const orgId = scope.orgId

  const originalFilename =
    (typeof form.get('filename') === 'string' && (form.get('filename') as string)) ||
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((file as any).name as string | undefined) ||
    'image'
  const ext = EXT_FOR_MIME[mime] ?? 'bin'

  const widthStr = form.get('width')
  const heightStr = form.get('height')
  const width = typeof widthStr === 'string' && Number.isFinite(Number(widthStr)) ? Number(widthStr) : undefined
  const height = typeof heightStr === 'string' && Number.isFinite(Number(heightStr)) ? Number(heightStr) : undefined

  const buf = Buffer.from(await file.arrayBuffer())
  // Belt-and-braces size check after buffering.
  if (buf.byteLength > MAX_BYTES) {
    return apiError(`File too large (max ${Math.round(MAX_BYTES / 1024 / 1024)}MB)`, 413)
  }

  const id = crypto.randomBytes(12).toString('hex')
  const storagePath = `email-images/${orgId}/${id}.${ext}`
  const downloadToken = crypto.randomUUID()

  const bucket = getStorage(getAdminApp()).bucket()
  const storedFile = bucket.file(storagePath)
  await storedFile.save(buf, {
    metadata: {
      contentType: mime,
      metadata: { firebaseStorageDownloadTokens: downloadToken },
    },
  })

  const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(storagePath)}?alt=media&token=${downloadToken}`

  const docData = {
    orgId,
    originalFilename,
    contentType: mime,
    sizeBytes: buf.byteLength,
    width: width ?? null,
    height: height ?? null,
    url,
    storagePath,
    deleted: false,
    createdAt: FieldValue.serverTimestamp(),
    ...actorFrom(user),
  }

  const ref = await adminDb.collection('email_images').add(docData)
  return apiSuccess({
    id: ref.id,
    url,
    width: width ?? null,
    height: height ?? null,
    sizeBytes: buf.byteLength,
    contentType: mime,
    originalFilename,
  }, 201)
})
