// app/(admin)/admin/org/[slug]/ads/campaigns/page.tsx
import Link from 'next/link'
import { resolveOrgIdBySlug } from '@/lib/organizations/resolve-by-slug'
import { listCampaigns } from '@/lib/ads/campaigns/store'

interface Params {
  slug: string
}

const STATUS_TINT: Record<string, string> = {
  DRAFT: 'bg-white/5 text-white/60',
  ACTIVE: 'bg-emerald-500/10 text-emerald-300',
  PAUSED: 'bg-[#F5A623]/10 text-[#F5A623]',
  ARCHIVED: 'bg-white/5 text-white/30',
  PENDING_REVIEW: 'bg-sky-500/10 text-sky-300',
}

export default async function CampaignsListPage({
  params,
}: {
  params: Promise<Params>
}) {
  const { slug } = await params
  const orgId = await resolveOrgIdBySlug(slug)
  if (!orgId) {
    return <div className="text-white/60">Org not found.</div>
  }
  const campaigns = await listCampaigns({ orgId })

  return (
    <section className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Campaigns</h1>
          <p className="text-sm text-white/60 mt-1">
            {campaigns.length} total — Phase 2 ships {campaigns.length === 0 ? 'an empty list — ' : ''}
            create + launch + pause flows; insights land in Phase 5.
          </p>
        </div>
        <Link
          href={`/admin/org/${slug}/ads/campaigns/new`}
          className="btn-pib-accent text-sm"
        >
          New campaign
        </Link>
      </header>

      {campaigns.length === 0 ? (
        <div className="rounded-lg border border-dashed border-white/10 p-8 text-center">
          <p className="text-white/60">No campaigns yet.</p>
          <Link
            href={`/admin/org/${slug}/ads/campaigns/new`}
            className="mt-3 inline-block text-sm text-[#F5A623] underline"
          >
            Build your first campaign →
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-white/5 rounded-lg border border-white/10">
          {campaigns.map((c) => (
            <li key={c.id} className="flex items-center justify-between px-5 py-4">
              <div>
                <Link
                  href={`/admin/org/${slug}/ads/campaigns/${c.id}`}
                  className="font-medium hover:text-[#F5A623]"
                >
                  {c.name}
                </Link>
                <div className="mt-0.5 text-xs text-white/40">
                  {c.objective} · {c.adAccountId}
                  {c.dailyBudget != null && ` · ${(c.dailyBudget / 100).toFixed(2)} daily`}
                  {c.lifetimeBudget != null && ` · ${(c.lifetimeBudget / 100).toFixed(2)} lifetime`}
                </div>
              </div>
              <span
                className={`rounded px-2 py-0.5 text-xs uppercase tracking-wide ${
                  STATUS_TINT[c.status] ?? STATUS_TINT.DRAFT
                }`}
              >
                {c.status.toLowerCase()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
