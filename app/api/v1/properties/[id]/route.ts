// app/api/v1/properties/[id]/route.ts
import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { lastActorFrom } from '@/lib/api/actor'
import { VALID_PROPERTY_TYPES, VALID_PROPERTY_STATUSES } from '@/lib/properties/types'
import type { UpdatePropertyInput } from '@/lib/properties/types'

export const dynamic = 'force-dynamic'

export const GET = withAuth('admin', async (_req: NextRequest, _user, ctx) => {
  const id = (ctx?.params as { id: string }).id
  const ref = adminDb.collection('properties').doc(id)
  const snap = await ref.get()
  if (!snap.exists || snap.data()?.deleted) return apiError('Not found', 404)
  return apiSuccess({ id: snap.id, ...snap.data() })
})

export const PUT = withAuth('admin', async (req: NextRequest, user, ctx) => {
  const id = (ctx?.params as { id: string }).id
  const ref = adminDb.collection('properties').doc(id)
  const snap = await ref.get()
  if (!snap.exists || snap.data()?.deleted) return apiError('Not found', 404)

  const body = await req.json() as UpdatePropertyInput

  if (body.type !== undefined && !VALID_PROPERTY_TYPES.includes(body.type)) {
    return apiError(`type must be one of: ${VALID_PROPERTY_TYPES.join(', ')}`, 400)
  }
  if (body.status !== undefined && !VALID_PROPERTY_STATUSES.includes(body.status)) {
    return apiError(`status must be one of: ${VALID_PROPERTY_STATUSES.join(', ')}`, 400)
  }

  const allowed: (keyof UpdatePropertyInput)[] = [
    'name', 'domain', 'type', 'status', 'config',
    'conversionSequenceId', 'emailSenderDomain', 'creatorLinkPrefix',
  ]

  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (body[key] !== undefined) updates[key] = body[key]
  }
  if (updates.domain) updates.domain = (updates.domain as string).trim().toLowerCase()
  if (updates.name) updates.name = (updates.name as string).trim()

  await ref.update({ ...updates, ...lastActorFrom(user) })

  const updated = await ref.get()
  return apiSuccess({ id: updated.id, ...updated.data() })
})

export const DELETE = withAuth('admin', async (_req: NextRequest, user, ctx) => {
  const id = (ctx?.params as { id: string }).id
  const ref = adminDb.collection('properties').doc(id)
  const snap = await ref.get()
  if (!snap.exists || snap.data()?.deleted) return apiError('Not found', 404)

  await ref.update({
    deleted: true,
    status: 'archived',
    ...lastActorFrom(user),
  })

  return apiSuccess({ id, deleted: true })
})
