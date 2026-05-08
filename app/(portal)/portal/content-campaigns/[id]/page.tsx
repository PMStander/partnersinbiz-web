import { notFound, redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { adminDb, adminAuth } from '@/lib/firebase/admin'
import { loadCampaignWithAssets } from '@/lib/campaigns/load'
import { AssetGrid } from '@/components/campaign-cockpit/AssetGrid'

export const dynamic = 'force-dynamic'

async function currentUser(): Promise<{ uid: string; orgId?: string } | null> {
  const cookieStore = await cookies()
  const cookieName = process.env.SESSION_COOKIE_NAME ?? '__session'
  const session = cookieStore.get(cookieName)?.value
  if (!session) return null
  try {
    const decoded = await adminAuth.verifySessionCookie(session, true)
    const userDoc = await adminDb.collection('users').doc(decoded.uid).get()
    return { uid: decoded.uid, orgId: userDoc.data()?.orgId }
  } catch {
    return null
  }
}

export default async function PortalContentCampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser()
  if (!user) redirect('/login')
  const { id } = await params
  const loaded = await loadCampaignWithAssets(id)
  if (!loaded) notFound()
  const { campaign, assets } = loaded
  if (campaign.orgId !== user.orgId) notFound()

  const totals = assets.meta?.totals ?? { social: 0, blogs: 0, videos: 0 }
  const byStatus = assets.meta?.byStatus ?? { draft: 0, pending_approval: 0, approved: 0, published: 0 }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">{campaign.name}</h1>
        <p className="text-sm text-[var(--color-pib-text-muted)]">
          {byStatus.pending_approval} awaiting your review
        </p>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Blogs" value={totals.blogs} />
        <Stat label="Videos" value={totals.videos} />
        <Stat label="Social" value={totals.social} />
        <Stat label="Awaiting review" value={byStatus.pending_approval ?? 0} accent />
      </section>

      <AssetGrid
        campaignId={id}
        brand={campaign.brandIdentity}
        social={assets.social ?? []}
        blogs={assets.blogs ?? []}
        videos={assets.videos ?? []}
        filter="all"
      />
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="card p-4">
      <p className="text-xs uppercase tracking-wide text-[var(--color-pib-text-muted)]">{label}</p>
      <p className={`text-2xl font-semibold mt-1 ${accent ? 'text-[var(--color-pib-accent)]' : ''}`}>
        {value}
      </p>
    </div>
  )
}
