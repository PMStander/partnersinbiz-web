// lib/ads/providers/meta/image-upload.ts
import { META_GRAPH_BASE } from './constants'

export async function uploadImageFromUrl(args: {
  adAccountId: string // 'act_xxx' (Meta-side ID — caller strips local prefix if needed)
  accessToken: string
  sourceUrl: string
}): Promise<string> {
  // 1. Download bytes
  const dl = await fetch(args.sourceUrl)
  if (!dl.ok) {
    throw new Error(`Image download failed: HTTP ${dl.status} for ${args.sourceUrl}`)
  }
  const bytes = new Uint8Array(await dl.arrayBuffer())
  const mimeType = dl.headers.get('content-type') ?? 'image/jpeg'

  // 2. Post to Meta /adimages as multipart form (Meta accepts raw bytes under any field name)
  const form = new FormData()
  const blob = new Blob([bytes], { type: mimeType })
  // Use a unique filename so /adimages.images map key is predictable enough to extract
  const filename = `phase2_upload_${Date.now()}.${mimeType.split('/')[1] ?? 'jpg'}`
  form.append(filename, blob, filename)
  form.append('access_token', args.accessToken)

  const accountId = args.adAccountId.startsWith('act_')
    ? args.adAccountId
    : `act_${args.adAccountId}`
  const url = `${META_GRAPH_BASE}/${accountId}/adimages`
  const up = await fetch(url, { method: 'POST', body: form })
  const body = (await up.json()) as
    | { images: Record<string, { hash: string; url?: string }> }
    | { error: { message: string } }

  if (!up.ok || 'error' in body) {
    const msg = 'error' in body ? body.error.message : `HTTP ${up.status}`
    throw new Error(`Meta /adimages failed: ${msg}`)
  }

  // /adimages returns { images: { <filename>: { hash, url } } } — there'll be one entry
  const entries = Object.values(body.images)
  if (entries.length === 0 || !entries[0]?.hash) {
    throw new Error('Meta /adimages returned no hash')
  }
  return entries[0].hash
}
