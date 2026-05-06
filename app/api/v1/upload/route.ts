// app/api/v1/upload/route.ts
import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { adminDb, getAdminApp } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { actorFrom } from '@/lib/api/actor'
import type { ApiUser } from '@/lib/api/types'

export const dynamic = 'force-dynamic'

export const POST = withAuth('admin', async (req: NextRequest, user: ApiUser) => {
  const formData = await req.formData().catch(() => null)
  if (!formData) return apiError('Invalid form data', 400)

  const file = formData.get('file') as File | null
  if (!file) return apiError('No file provided', 400)

  const folder = (formData.get('folder') as string) || 'uploads'
  const orgId = (formData.get('orgId') as string) || null
  const relatedToType = (formData.get('relatedToType') as string) || null
  const relatedToId = (formData.get('relatedToId') as string) || null
  const ext = file.name.split('.').pop() ?? 'bin'
  const filename = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)

  try {
    const bucket = getStorage(getAdminApp()).bucket()
    const fileRef = bucket.file(filename)

    await fileRef.save(buffer, {
      metadata: { contentType: file.type },
    })
    await fileRef.makePublic()

    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filename}`

    const docRef = await adminDb.collection('uploads').add({
      orgId,
      name: file.name,
      storagePath: filename,
      url: publicUrl,
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
      folder,
      relatedTo: relatedToType && relatedToId ? { type: relatedToType, id: relatedToId } : null,
      ...actorFrom(user),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      deleted: false,
    })

    return apiSuccess({ id: docRef.id, url: publicUrl, name: file.name, mimeType: file.type, size: file.size })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[upload] Firebase Storage error:', message)
    return apiError(`Storage error: ${message}`, 500)
  }
})
