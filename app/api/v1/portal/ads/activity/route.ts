// app/api/v1/portal/ads/activity/route.ts
//
// Portal activity feed (ad-scoped).
// Returns activity entries from the `activity` collection (note: singular,
// see lib/activity/log.ts) filtered to ad-related types only.
//
// Why we filter in-memory rather than via Firestore:
//   The activity entries logged by lib/ads/activity.ts use 5 different
//   `type` prefixes (`ad_campaign.`, `ad_set.`, `ad.`, `ad_creative.`,
//   `ad_custom_audience.`). Firestore can't do prefix matches and an
//   `in` clause needs exact values. We overfetch and post-filter, which
//   is fine for portal volumes.
import { NextRequest } from 'next/server'
import { withPortalAuthAndRole } from '@/lib/auth/portal-middleware'
import { apiSuccess, apiError } from '@/lib/api/response'
import { adminDb } from '@/lib/firebase/admin'
import type { OrgRole } from '@/lib/organizations/types'

export const dynamic = 'force-dynamic'

const AD_TYPE_PREFIXES = [
  'ad.',
  'ad_campaign.',
  'ad_set.',
  'ad_creative.',
  'ad_custom_audience.',
]

function isAdActivity(type: unknown): boolean {
  if (typeof type !== 'string') return false
  return AD_TYPE_PREFIXES.some((prefix) => type.startsWith(prefix))
}

export const GET = withPortalAuthAndRole(
  'viewer',
  async (req: NextRequest, _uid: string, orgId: string, _role: OrgRole) => {
    try {
      const url = new URL(req.url)
      const limitParam = parseInt(url.searchParams.get('limit') ?? '50', 10)
      const limit = Math.min(Math.max(1, isNaN(limitParam) ? 50 : limitParam), 100)
      const cursorIso = url.searchParams.get('cursor')

      // Overfetch (3x) so the post-filter to ad-only still hits the requested limit.
      let q: FirebaseFirestore.Query = adminDb
        .collection('activity')
        .where('orgId', '==', orgId)
        .orderBy('createdAt', 'desc')
        .limit(limit * 3)

      if (cursorIso) {
        const cursorDate = new Date(cursorIso)
        if (!isNaN(cursorDate.getTime())) {
          q = q.startAfter(cursorDate)
        }
      }

      const snap = await q.get()
      const adOnly = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) }))
        .filter((a) => isAdActivity((a as { type?: unknown }).type))
        .slice(0, limit)

      // Cursor uses ISO timestamp; tolerate Firestore Timestamp or plain Date.
      const last = adOnly[adOnly.length - 1] as { createdAt?: unknown } | undefined
      let nextCursor: string | null = null
      if (last?.createdAt) {
        const ts = last.createdAt as { toDate?: () => Date }
        if (typeof ts.toDate === 'function') {
          nextCursor = ts.toDate().toISOString()
        } else if (last.createdAt instanceof Date) {
          nextCursor = last.createdAt.toISOString()
        }
      }

      return apiSuccess({ entries: adOnly, nextCursor })
    } catch (err) {
      return apiError((err as Error).message ?? 'Failed to load activity', 500)
    }
  },
) as any
