import { NextRequest } from 'next/server'
import { google } from 'googleapis'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { refreshGscClient } from '@/lib/seo/integrations/gsc'
import { decryptCredentials } from '@/lib/integrations/crypto'
import type { ApiUser } from '@/lib/api/types'

export const dynamic = 'force-dynamic'

export const GET = withAuth(
  'admin',
  async (_req: NextRequest, user: ApiUser, ctx: { params: Promise<{ sprintId: string }> }) => {
    const { sprintId } = await ctx.params
    const snap = await adminDb.collection('seo_sprints').doc(sprintId).get()
    if (!snap.exists) return apiError('Sprint not found', 404)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = snap.data() as any
    if (user.role !== 'ai' && data.orgId !== user.orgId) return apiError('Access denied', 403)
    const tokens = data.integrations?.gsc?.tokens
    if (!tokens) return apiError('GSC not connected', 400)
    const decrypted = decryptCredentials<{ refresh_token?: string }>(tokens, data.orgId)
    if (!decrypted.refresh_token) return apiError('GSC tokens missing refresh_token', 400)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const auth = refreshGscClient(decrypted.refresh_token) as any
    const wm = google.webmasters({ version: 'v3', auth })
    const sites = await wm.sites.list()
    const properties = (sites.data.siteEntry ?? []).map((s) => ({
      siteUrl: s.siteUrl,
      permissionLevel: s.permissionLevel,
    }))
    return apiSuccess(properties)
  },
)
