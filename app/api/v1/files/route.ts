/**
 * GET /api/v1/files — list/search uploaded files from the `uploads` collection
 *
 * Read-only wrapper over the `uploads` collection. File bytes are written
 * by POST /api/v1/upload (which stores the blob in Firebase Storage and a
 * metadata doc in `uploads`). This endpoint never touches storage.
 *
 * Auth: admin (AI/admin)
 */
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'

export const dynamic = 'force-dynamic'

interface UploadDoc {
  id: string
  orgId?: string
  name?: string
  mimeType?: string
  relatedTo?: { type?: string; id?: string } | null
  deleted?: boolean
  createdAt?: unknown
  [key: string]: unknown
}

export const GET = withAuth('admin', async (req) => {
  const { searchParams } = new URL(req.url)

  const orgId = searchParams.get('orgId')
  if (!orgId) return apiError('orgId is required; pass it as a query param')

  const type = searchParams.get('type') // mime prefix, e.g. "image/"
  const search = searchParams.get('search')?.trim().toLowerCase() ?? ''
  const relatedToType = searchParams.get('relatedToType')
  const relatedToId = searchParams.get('relatedToId')

  const limit = Math.min(
    Math.max(parseInt(searchParams.get('limit') ?? '50', 10), 1),
    200,
  )
  const page = Math.max(parseInt(searchParams.get('page') ?? '1', 10), 1)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = adminDb
    .collection('uploads')
    .where('orgId', '==', orgId)

  if (type) {
    // Mime-prefix filter implemented via a Firestore range query:
    //   "image/" <= mimeType < "image/\uf8ff"
    const prefix = type
    const upper = `${prefix}\uf8ff`
    query = query
      .where('mimeType', '>=', prefix)
      .where('mimeType', '<', upper)
  }

  if (relatedToType) {
    query = query.where('relatedTo.type', '==', relatedToType)
  }
  if (relatedToId) {
    query = query.where('relatedTo.id', '==', relatedToId)
  }

  // When we range-filter on `mimeType` Firestore requires the first orderBy
  // to be on that same field; we then secondary-sort on `createdAt desc`.
  // Otherwise primary sort is `createdAt desc`.
  if (type) {
    query = query.orderBy('mimeType').orderBy('createdAt', 'desc')
  } else {
    query = query.orderBy('createdAt', 'desc')
  }

  const snapshot = await query.get()

  let files: UploadDoc[] = snapshot.docs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((doc: any) => ({ id: doc.id, ...doc.data() }) as UploadDoc)
    .filter((f: UploadDoc) => f.deleted !== true)

  // In-memory substring match on filename.
  if (search) {
    files = files.filter((f) => {
      const name = (f.name ?? '').toString().toLowerCase()
      return name.includes(search)
    })
  }

  const total = files.length
  const start = (page - 1) * limit
  const paged = files.slice(start, start + limit)

  return apiSuccess(paged, 200, { total, page, limit })
})
