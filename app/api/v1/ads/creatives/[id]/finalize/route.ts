// app/api/v1/ads/creatives/[id]/finalize/route.ts
import { NextRequest } from 'next/server'
import { getStorage } from 'firebase-admin/storage'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { getCreative, updateCreative } from '@/lib/ads/creatives/store'
import { previewStoragePath, publicReadUrl } from '@/lib/ads/creatives/storage'
import { probeMetadata, generatePreview } from '@/lib/ads/creatives/finalize'

export const POST = withAuth(
  'admin',
  async (req: NextRequest, _user: unknown, ctxParams: { params: Promise<{ id: string }> }) => {
    const orgId = req.headers.get('X-Org-Id')
    if (!orgId) return apiError('Missing X-Org-Id header', 400)

    const { id } = await ctxParams.params
    const c = await getCreative(id)
    if (!c || c.orgId !== orgId) return apiError('Creative not found', 404)

    try {
      // 1. Download bytes from canonical source
      const dl = await fetch(c.sourceUrl)
      if (!dl.ok) throw new Error(`Source download failed: HTTP ${dl.status}`)
      const buffer = Buffer.from(await dl.arrayBuffer())

      // 2. Probe metadata (dimensions for images; placeholder for videos in Phase 3)
      const meta = await probeMetadata({ buffer, mimeType: c.mimeType })

      // 3. Generate preview (image: 360p JPEG; video: null in Phase 3)
      const previewBuffer = await generatePreview({ buffer, mimeType: c.mimeType })

      // 4. Upload preview if generated
      let previewUrl: string | undefined
      if (previewBuffer) {
        const path = previewStoragePath({ orgId, creativeId: id })
        await getStorage()
          .bucket()
          .file(path)
          .save(previewBuffer, { contentType: 'image/jpeg' })
        previewUrl = publicReadUrl(path)
      }

      // 5. Update doc to READY with probed metadata
      await updateCreative(id, {
        width: meta.width,
        height: meta.height,
        duration: meta.duration,
        previewUrl,
        status: 'READY',
      })

      const updated = await getCreative(id)
      return apiSuccess(updated)
    } catch (err) {
      await updateCreative(id, { status: 'FAILED', lastError: (err as Error).message })
      return apiError(`Finalize failed: ${(err as Error).message}`, 500)
    }
  },
)
