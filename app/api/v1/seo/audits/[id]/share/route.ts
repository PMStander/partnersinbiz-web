import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { randomBytes } from 'crypto'
import type { ApiUser } from '@/lib/api/types'

export const dynamic = 'force-dynamic'

export const GET = withAuth(
  'admin',
  async (_req: NextRequest, user: ApiUser, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params
    const ref = adminDb.collection('seo_audits').doc(id)
    const snap = await ref.get()
    if (!snap.exists) return apiError('Audit not found', 404)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = snap.data() as any
    if (user.role !== 'ai' && data.orgId !== user.orgId) return apiError('Access denied', 403)
    let token = data.publicShareToken
    if (!token) {
      token = randomBytes(20).toString('base64url')
      await ref.update({ publicShareToken: token })
    }
    const base = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://partnersinbiz.online'
    return apiSuccess({ url: `${base}/seo-audit/${token}`, token })
  },
)
