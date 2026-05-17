import { cookies } from 'next/headers'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { adminAuth, adminDb } from '@/lib/firebase/admin'
import { getCampaign } from '@/lib/ads/campaigns/store'
import { listAdSets } from '@/lib/ads/adsets/store'
import { listAds } from '@/lib/ads/ads/store'
import { InsightsChart } from '@/components/ads/InsightsChart'
import { ApprovalActions } from './ApprovalActions'

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

export default async function PortalAdCampaignDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await currentClient()
  if (!user) redirect('/login')

  const campaign = await getCampaign(id)
  if (!campaign || campaign.orgId !== user.orgId) notFound()

  const [adSets, ads] = await Promise.all([
    listAdSets({ orgId: user.orgId, campaignId: id }),
    listAds({ orgId: user.orgId, campaignId: id }),
  ])

  const isAwaiting = campaign.reviewState === 'awaiting'
  const isApproved = campaign.reviewState === 'approved'
  const isRejected = campaign.reviewState === 'rejected'

  return (
    <article className="space-y-6">
      <header>
        <Link href="/portal/ads" className="text-xs text-[var(--color-pib-text-muted)] hover:text-[var(--color-pib-text)]">
          ← Campaigns
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-[var(--color-pib-text)]">{campaign.name}</h1>
        <div className="mt-1 text-sm text-[var(--color-pib-text-muted)]">
          {campaign.objective.toLowerCase()} · {campaign.status.toLowerCase()} · {campaign.adAccountId}
        </div>
      </header>

      {isAwaiting && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined text-amber-300">campaign</span>
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-100">Awaiting your approval</p>
              <p className="text-xs text-[var(--color-pib-text-muted)] mt-0.5">
                Partners in Biz drafted this campaign for you. It won&apos;t launch until you approve.
              </p>
            </div>
          </div>
          <div className="mt-3">
            <ApprovalActions campaignId={id} />
          </div>
        </div>
      )}

      {isApproved && (
        <div className="rounded-lg border border-emerald-600/40 bg-emerald-600/5 p-3 text-sm text-emerald-100">
          ✓ You approved this campaign. Partners in Biz will launch it shortly.
        </div>
      )}

      {isRejected && (
        <div className="rounded-lg border border-red-600/40 bg-red-600/5 p-4">
          <p className="text-sm font-medium text-red-100">Rejected — sent back for changes</p>
          {campaign.rejectionReason && (
            <blockquote className="mt-2 text-xs text-[var(--color-pib-text-muted)] border-l-2 border-red-500/40 pl-3">
              {campaign.rejectionReason}
            </blockquote>
          )}
        </div>
      )}

      <section>
        <h2 className="eyebrow !text-[10px] mb-2">Ad sets · {adSets.length}</h2>
        {adSets.length === 0 ? (
          <div className="rounded border border-dashed border-[var(--color-pib-line)] p-4 text-sm text-[var(--color-pib-text-muted)]">
            No ad sets yet.
          </div>
        ) : (
          <ul className="divide-y divide-[var(--color-pib-line)] rounded border border-[var(--color-pib-line)]">
            {adSets.map((s) => {
              const setAds = ads.filter((a) => a.adSetId === s.id)
              return (
                <li key={s.id} className="px-4 py-3 text-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-[var(--color-pib-text)]">{s.name}</div>
                      <div className="text-xs text-[var(--color-pib-text-muted)]">
                        {s.optimizationGoal.toLowerCase()} · {s.billingEvent.toLowerCase()}
                      </div>
                    </div>
                    <span className="text-xs uppercase tracking-wide text-[var(--color-pib-text-muted)]">{s.status.toLowerCase()}</span>
                  </div>
                  {setAds.length > 0 && (
                    <ul className="mt-2 ml-4 space-y-1 border-l border-[var(--color-pib-line)] pl-3">
                      {setAds.map((a) => (
                        <li key={a.id} className="flex items-center justify-between text-xs">
                          <span className="text-[var(--color-pib-text)]">
                            {a.name} <span className="text-[var(--color-pib-text-muted)]">({a.format.toLowerCase()})</span>
                          </span>
                          <span className="text-[var(--color-pib-text-muted)]">{a.status.toLowerCase()}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {campaign.status !== 'DRAFT' && (
        <section>
          <h2 className="eyebrow !text-[10px] mb-2">Performance</h2>
          <div className="rounded border border-[var(--color-pib-line)] p-4">
            <InsightsChart orgId={user.orgId} level="campaign" pibEntityId={id} daysBack={14} />
          </div>
        </section>
      )}
    </article>
  )
}
