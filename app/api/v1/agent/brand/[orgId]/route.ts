/**
 * GET /api/v1/agent/brand/[orgId] — get brand profile for an organization
 * PUT /api/v1/agent/brand/[orgId] — upsert brand profile / brand colors (merge)
 *
 * Used by AI agents and admins to read and write brand context before
 * generating content. Both fields merge atomically so partial updates are safe.
 */
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { lastActorFrom } from '@/lib/api/actor'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ orgId: string }> }

export const GET = withAuth('admin', async (req, user, ctx) => {
  const { orgId } = await (ctx as RouteContext).params

  const doc = await adminDb.collection('organizations').doc(orgId).get()
  if (!doc.exists) return apiError('Organisation not found', 404)

  const data = doc.data()!

  return apiSuccess({
    orgId,
    name: data.name,
    industry: data.industry,
    brandProfile: data.brandProfile ?? {},
    brandColors: data.settings?.brandColors ?? {},
  })
})

export const PUT = withAuth('admin', async (req, user, ctx) => {
  const { orgId } = await (ctx as RouteContext).params

  const ref = adminDb.collection('organizations').doc(orgId)
  const snap = await ref.get()
  if (!snap.exists) return apiError('Organisation not found', 404)

  const body = await req.json().catch(() => ({}))
  const brandProfile = body?.brandProfile as Record<string, unknown> | undefined
  const brandColors = body?.brandColors as Record<string, unknown> | undefined

  if (
    (!brandProfile || typeof brandProfile !== 'object') &&
    (!brandColors || typeof brandColors !== 'object')
  ) {
    return apiError('Provide brandProfile and/or brandColors to update', 400)
  }

  const merge: Record<string, unknown> = { ...lastActorFrom(user) }
  if (brandProfile && typeof brandProfile === 'object') merge.brandProfile = brandProfile
  if (brandColors && typeof brandColors === 'object') merge.settings = { brandColors }

  await ref.set(merge, { merge: true })

  return apiSuccess({ orgId, updated: true })
})
