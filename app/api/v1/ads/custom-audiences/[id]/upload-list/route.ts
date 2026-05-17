// app/api/v1/ads/custom-audiences/[id]/upload-list/route.ts
import { NextRequest } from 'next/server'
import crypto from 'crypto'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { getCustomAudience, updateCustomAudience } from '@/lib/ads/custom-audiences/store'
import { requireMetaContext } from '@/lib/ads/api-helpers'
import { metaProvider } from '@/lib/ads/providers/meta'

/** Lowercase + trim + SHA-256 hex hash per Meta spec. */
function hashField(raw: string): string {
  return crypto.createHash('sha256').update(raw.toLowerCase().trim()).digest('hex')
}

const BATCH_SIZE = 10000 // Meta supports up to 10k per request
const VALID_COLUMNS = ['EMAIL', 'PHONE'] as const

export const POST = withAuth(
  'admin',
  async (req: NextRequest, _user: unknown, ctxParams: { params: Promise<{ id: string }> }) => {
    const { id } = await ctxParams.params
    const orgId = req.headers.get('X-Org-Id')
    if (!orgId) return apiError('Missing X-Org-Id header', 400)
    const ca = await getCustomAudience(id)
    if (!ca || ca.orgId !== orgId) return apiError('Custom audience not found', 404)
    if (ca.type !== 'CUSTOMER_LIST') return apiError('Only CUSTOMER_LIST audiences support upload-list', 400)
    const metaCaId = ca.providerData?.meta?.customAudienceId
    if (!metaCaId) return apiError('Custom audience not yet synced to Meta', 400)

    const ctx = await requireMetaContext(req)
    if (ctx instanceof Response) return ctx

    // Parse multipart form
    const form = await req.formData()
    const file = form.get('file')
    const columnsStr = form.get('columns') as string | null
    if (!(file instanceof Blob) || !columnsStr) {
      return apiError('Missing file or columns', 400)
    }
    const columns = JSON.parse(columnsStr) as string[]
    if (
      columns.length === 0 ||
      !columns.every((c) => (VALID_COLUMNS as readonly string[]).includes(c))
    ) {
      return apiError('columns must be a non-empty array of EMAIL and/or PHONE', 400)
    }

    // Parse CSV (basic — assumes no embedded commas/quotes)
    const text = await file.text()
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
    if (lines.length < 2) return apiError('CSV must have at least one data row', 400)

    const header = lines[0].split(',').map((h) => h.trim().toUpperCase())
    const columnIndices = columns.map((c) => header.indexOf(c))
    if (columnIndices.some((i) => i === -1)) {
      return apiError(`CSV missing required columns: ${columns.join(', ')}`, 400)
    }

    // Hash rows
    const hashedRows: string[][] = []
    for (let i = 1; i < lines.length; i++) {
      const cells = lines[i].split(',')
      const hashes = columnIndices.map((ci) => {
        const cell = cells[ci]?.trim() ?? ''
        return cell ? hashField(cell) : ''
      })
      // Skip rows with all-empty fields
      if (hashes.some((h) => h.length > 0)) {
        hashedRows.push(hashes)
      }
    }

    // Chunked upload
    let totalUploaded = 0
    for (let i = 0; i < hashedRows.length; i += BATCH_SIZE) {
      const batch = hashedRows.slice(i, i + BATCH_SIZE)
      const result = await metaProvider.customAudienceCRUD!({
        op: 'upload-users',
        accessToken: ctx.accessToken,
        metaCaId,
        uploadPayload: { schema: columns, hashedRows: batch },
      })
      totalUploaded += (result as { numReceived?: number }).numReceived ?? batch.length
    }

    await updateCustomAudience(id, {
      status: 'BUILDING',
    })
    const updated = await getCustomAudience(id)
    return apiSuccess({
      ...updated,
      uploadStats: { rowsHashed: hashedRows.length, totalUploaded },
    })
  },
)
