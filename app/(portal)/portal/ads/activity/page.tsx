import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { adminAuth, adminDb } from '@/lib/firebase/admin'

export const dynamic = 'force-dynamic'

// Mirror of `app/(portal)/portal/ads/page.tsx::currentClient()` — kept inline
// because there's no shared portal-auth helper for server components yet.
async function currentClient(): Promise<{ uid: string; orgId: string } | null> {
  const cookieStore = await cookies()
  const cookieName = process.env.SESSION_COOKIE_NAME ?? '__session'
  const session = cookieStore.get(cookieName)?.value
  if (!session) return null
  try {
    const decoded = await adminAuth.verifySessionCookie(session, true)
    const userDoc = await adminDb.collection('users').doc(decoded.uid).get()
    const orgId = userDoc.data()?.activeOrgId ?? userDoc.data()?.orgId
    if (!orgId) return null
    return { uid: decoded.uid, orgId }
  } catch {
    return null
  }
}

interface ActivityEntry {
  id: string
  type?: string
  description?: string
  actorName?: string
  actorRole?: 'admin' | 'client' | 'ai'
  entityId?: string
  entityType?: string
  entityTitle?: string
  createdAt?: { toDate?: () => Date } | Date | null
}

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

async function loadAdActivity(orgId: string, pageLimit = 50): Promise<ActivityEntry[]> {
  // Overfetch and post-filter — see /api/v1/portal/ads/activity/route.ts for rationale.
  const snap = await adminDb
    .collection('activity')
    .where('orgId', '==', orgId)
    .orderBy('createdAt', 'desc')
    .limit(pageLimit * 3)
    .get()

  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<ActivityEntry, 'id'>) }))
    .filter((a) => isAdActivity(a.type))
    .slice(0, pageLimit)
}

function toDateOrNull(value: ActivityEntry['createdAt']): Date | null {
  if (!value) return null
  if (value instanceof Date) return value
  if (typeof (value as { toDate?: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate()
  }
  return null
}

function formatTimeAgo(value: ActivityEntry['createdAt']): string {
  const date = toDateOrNull(value)
  if (!date) return ''
  const diffMs = Date.now() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  if (diffSec < 60) return '<1m ago'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 14) return `${diffDay}d ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function describeKind(type: string | undefined): string {
  if (!type) return 'updated'
  switch (type) {
    case 'ad_campaign.created':    return 'created campaign'
    case 'ad_campaign.launched':   return 'launched campaign'
    case 'ad_campaign.paused':     return 'paused campaign'
    case 'ad_campaign.edited':     return 'edited campaign'
    case 'ad_campaign.deleted':    return 'deleted campaign'
    case 'ad_set.created':         return 'created ad set'
    case 'ad_set.launched':        return 'launched ad set'
    case 'ad_set.paused':          return 'paused ad set'
    case 'ad_set.edited':          return 'edited ad set'
    case 'ad_set.deleted':         return 'deleted ad set'
    case 'ad.created':             return 'created ad'
    case 'ad.launched':            return 'launched ad'
    case 'ad.paused':              return 'paused ad'
    case 'ad.edited':              return 'edited ad'
    case 'ad.deleted':             return 'deleted ad'
    case 'ad_creative.uploaded':   return 'uploaded creative'
    case 'ad_creative.archived':   return 'archived creative'
    case 'ad_creative.synced':     return 'synced creative'
    case 'ad_custom_audience.created':        return 'created custom audience'
    case 'ad_custom_audience.list_uploaded':  return 'uploaded list to custom audience'
    case 'ad_custom_audience.deleted':        return 'deleted custom audience'
    default:
      return type.replace(/[._]/g, ' ')
  }
}

export default async function PortalAdsActivityPage() {
  const user = await currentClient()
  if (!user) redirect('/login')

  const entries = await loadAdActivity(user.orgId)

  if (entries.length === 0) {
    return (
      <div className="pib-card p-10 text-center text-sm text-[var(--color-pib-text-muted)]">
        No ad activity yet. Updates appear here as Partners in Biz launches campaigns + you approve them.
      </div>
    )
  }

  return (
    <section className="space-y-2">
      <h2 className="eyebrow !text-[10px] mb-2">Activity · {entries.length}</h2>
      <ul className="divide-y divide-[var(--color-pib-line)] rounded border border-[var(--color-pib-line)] bg-white/[0.02]">
        {entries.map((e) => {
          const subject = e.entityTitle ?? e.entityId ?? ''
          return (
            <li key={e.id} className="px-4 py-3 text-sm">
              <p className="text-[var(--color-pib-text)]">
                <span className="font-medium">{e.actorName ?? 'Someone'}</span>{' '}
                <span className="text-[var(--color-pib-text-muted)]">{describeKind(e.type)}</span>
                {subject ? (
                  <>
                    {' '}
                    <span className="text-[var(--color-pib-text)]">{subject}</span>
                  </>
                ) : null}
              </p>
              <time className="text-xs text-[var(--color-pib-text-muted)]">
                {formatTimeAgo(e.createdAt)}
              </time>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
