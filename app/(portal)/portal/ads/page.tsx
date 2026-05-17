import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { adminAuth, adminDb } from '@/lib/firebase/admin'
import { listCampaigns } from '@/lib/ads/campaigns/store'
import type { AdCampaign } from '@/lib/ads/types'

export const dynamic = 'force-dynamic'

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

const STATUS_COLOR: Record<string, string> = {
  DRAFT:          'bg-zinc-700/30 text-zinc-300 border border-zinc-600/30',
  PENDING_REVIEW: 'bg-amber-700/30 text-amber-200 border border-amber-600/30',
  ACTIVE:         'bg-emerald-700/30 text-emerald-200 border border-emerald-600/30',
  PAUSED:         'bg-amber-700/30 text-amber-200 border border-amber-600/30',
  DELETED:        'bg-red-700/30 text-red-200 border border-red-600/30',
}

export default async function PortalAdsListPage() {
  const user = await currentClient()
  if (!user) redirect('/login')

  const campaigns = await listCampaigns({ orgId: user.orgId })
  // Sort: awaiting-review first (orange highlighted), then by recency
  const awaiting = campaigns.filter((c) => c.reviewState === 'awaiting')
  const other = campaigns.filter((c) => c.reviewState !== 'awaiting')

  if (campaigns.length === 0) {
    return (
      <div className="pib-card p-10 text-center text-sm text-[var(--color-pib-text-muted)]">
        No campaigns yet. Partners in Biz will draft your first campaigns and submit them here for your approval.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {awaiting.length > 0 && (
        <section>
          <h2 className="eyebrow !text-[10px] mb-2">Awaiting your review · {awaiting.length}</h2>
          <ul className="space-y-2">
            {awaiting.map((c) => (
              <CampaignRow key={c.id} campaign={c} highlight />
            ))}
          </ul>
        </section>
      )}
      {other.length > 0 && (
        <section>
          <h2 className="eyebrow !text-[10px] mb-2">Campaigns · {other.length}</h2>
          <ul className="space-y-2">
            {other.map((c) => (
              <CampaignRow key={c.id} campaign={c} />
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function CampaignRow({ campaign, highlight }: { campaign: AdCampaign; highlight?: boolean }) {
  return (
    <li
      className={[
        'rounded-lg border p-4 transition-colors',
        highlight
          ? 'border-amber-500/40 bg-amber-500/5 hover:bg-amber-500/10'
          : 'border-[var(--color-pib-line)] bg-white/[0.02] hover:bg-white/[0.04]',
      ].join(' ')}
    >
      <Link href={`/portal/ads/campaigns/${campaign.id}`} className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="font-medium text-[var(--color-pib-text)] truncate">{campaign.name}</div>
          <div className="text-xs text-[var(--color-pib-text-muted)] mt-0.5">
            {campaign.objective.toLowerCase()} · {campaign.adAccountId}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {highlight && (
            <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-200 border border-amber-500/40">
              Review needed
            </span>
          )}
          <span className={['text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full', STATUS_COLOR[campaign.status] ?? STATUS_COLOR.DRAFT].join(' ')}>
            {campaign.status.toLowerCase()}
          </span>
        </div>
      </Link>
    </li>
  )
}
