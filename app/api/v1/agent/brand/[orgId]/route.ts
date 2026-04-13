/**
 * GET /api/v1/agent/brand/[orgId] — get brand profile for an organization
 * Used by AI agents to fetch brand context before generating content
 */
import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'

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
