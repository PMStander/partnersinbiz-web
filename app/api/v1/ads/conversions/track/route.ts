// app/api/v1/ads/conversions/track/route.ts
//
// Client-server CAPI ingest endpoint.
// Auth via X-Property-Id + X-Ingest-Key headers (same pattern as analytics ingest).
// No withAuth wrapper — this is called from client SDKs / GTM server containers, not admin UIs.

import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { trackConversion } from '@/lib/ads/capi/track'
import { apiSuccess, apiError, apiErrorFromException } from '@/lib/api/response'
import type { CapiEventInput } from '@/lib/ads/capi/types'

export const dynamic = 'force-dynamic'

function validateBody(body: unknown): string | null {
  if (!body || typeof body !== 'object') return 'Request body must be a JSON object'
  const b = body as Record<string, unknown>
  if (!b.event_id || typeof b.event_id !== 'string') return 'event_id is required'
  if (!b.event_name || typeof b.event_name !== 'string') return 'event_name is required'
  if (typeof b.event_time !== 'number') return 'event_time is required and must be a unix timestamp (number)'
  if (!b.user || typeof b.user !== 'object') return 'user is required'
  if (!b.action_source || typeof b.action_source !== 'string') return 'action_source is required'
  return null
}

export async function POST(req: NextRequest) {
  // 1. Read ingest auth headers
  const propertyId = req.headers.get('x-property-id')
  const ingestKey = req.headers.get('x-ingest-key')

  if (!propertyId || !ingestKey) {
    return apiError('X-Property-Id and X-Ingest-Key headers are required', 400)
  }

  // 2. Parse body
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError('Invalid JSON', 400)
  }

  // 3. Validate body shape
  const validationError = validateBody(body)
  if (validationError) {
    return apiError(validationError, 400)
  }

  // 4. Look up property and verify ingest key
  let propSnap: FirebaseFirestore.DocumentSnapshot
  try {
    propSnap = await adminDb.collection('properties').doc(propertyId).get()
  } catch (err) {
    return apiErrorFromException(err)
  }

  if (!propSnap.exists) {
    return apiError('Property not found', 404)
  }

  const property = propSnap.data()!

  if (property.ingestKey !== ingestKey) {
    return apiError('Invalid ingest key', 401)
  }

  const orgId: string = property.orgId

  // 5. Dispatch to trackConversion
  try {
    const result = await trackConversion({ orgId, input: body as CapiEventInput })
    return apiSuccess(result)
  } catch (err) {
    return apiErrorFromException(err)
  }
}
