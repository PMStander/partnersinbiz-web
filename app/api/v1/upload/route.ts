// app/api/v1/upload/route.ts
import { NextRequest } from 'next/server'
import { getStorage } from 'firebase-admin/storage'
import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import type { ApiUser } from '@/lib/api/types'

export const dynamic = 'force-dynamic'

function getAdminApp() {
  if (getApps().length > 0) return getApps()[0]
  return initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  })
}

export const POST = withAuth('admin', async (req: NextRequest, _user: ApiUser) => {
  const formData = await req.formData().catch(() => null)
  if (!formData) return apiError('Invalid form data', 400)

  const file = formData.get('file') as File | null
  if (!file) return apiError('No file provided', 400)

  const folder = (formData.get('folder') as string) || 'uploads'
  const ext = file.name.split('.').pop() ?? 'bin'
  const filename = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)

  const bucket = getStorage(getAdminApp()).bucket()
  const fileRef = bucket.file(filename)

  await fileRef.save(buffer, {
    metadata: { contentType: file.type },
    public: true,
  })

  const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filename}`
  return apiSuccess({ url: publicUrl })
})
