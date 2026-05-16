// app/api/v1/ads/creatives/upload-url/route.ts
import { NextRequest } from 'next/server'
import crypto from 'crypto'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import {
  sourceStoragePath,
  signedUploadUrl,
  extensionFromMime,
  creativeTypeFromMime,
  publicReadUrl,
} from '@/lib/ads/creatives/storage'
import { createCreative } from '@/lib/ads/creatives/store'
import type { CreateAdCreativeInput } from '@/lib/ads/types'

const MAX_FILE_SIZE = 100 * 1024 * 1024 // 100 MB

export const POST = withAuth('admin', async (req: NextRequest, user) => {
  const orgId = req.headers.get('X-Org-Id')
  if (!orgId) return apiError('Missing X-Org-Id header', 400)

  const body = (await req.json()) as { name?: string; mimeType?: string; fileSize?: number }

  if (!body.name) return apiError('Missing name', 400)
  if (!body.mimeType) return apiError('Missing mimeType', 400)
  if (typeof body.fileSize !== 'number' || body.fileSize <= 0)
    return apiError('Missing or invalid fileSize', 400)
  if (body.fileSize > MAX_FILE_SIZE)
    return apiError(`File too large (max ${MAX_FILE_SIZE} bytes)`, 400)

  const type = creativeTypeFromMime(body.mimeType)
  if (!type) return apiError(`Unsupported mimeType: ${body.mimeType}`, 400)

  const creativeId = `crv_${crypto.randomBytes(8).toString('hex')}`
  const ext = extensionFromMime(body.mimeType)
  const storagePath = sourceStoragePath({ orgId, creativeId, ext })
  const sourceUrl = publicReadUrl(storagePath)

  const { uploadUrl, expiresAt } = await signedUploadUrl({
    storagePath,
    contentType: body.mimeType,
  })

  const input: CreateAdCreativeInput = {
    type,
    name: body.name,
    storagePath,
    sourceUrl,
    fileSize: body.fileSize,
    mimeType: body.mimeType,
    status: 'UPLOADING',
  }

  await createCreative({
    orgId,
    createdBy: (user as { uid?: string }).uid ?? 'unknown',
    input,
    id: creativeId,
  })

  return apiSuccess({
    creativeId,
    uploadUrl,
    expiresAt,
    storagePath,
    sourceUrl,
  })
})
