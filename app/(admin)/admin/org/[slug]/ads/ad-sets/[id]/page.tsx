// app/(admin)/admin/org/[slug]/ads/ad-sets/[id]/page.tsx
import Link from 'next/link'
import { resolveOrgIdBySlug } from '@/lib/organizations/resolve-by-slug'
import { getAdSet } from '@/lib/ads/adsets/store'
import { listAds } from '@/lib/ads/ads/store'
import { getCampaign } from '@/lib/ads/campaigns/store'

interface Params {
  slug: string
  id: string
}

export default async function AdSetDetailPage({
  params,
}: {
  params: Promise<Params>
}) {
  const { slug, id } = await params
  const orgId = await resolveOrgIdBySlug(slug)
  if (!orgId) return <div className="text-white/60">Org not found.</div>
  const adSet = await getAdSet(id)
  if (!adSet || adSet.orgId !== orgId) {
    return <div className="text-white/60">Ad set not found.</div>
  }
  const [parent, ads] = await Promise.all([
    getCampaign(adSet.campaignId),
    listAds({ orgId, adSetId: id }),
  ])
  const metaId = (adSet.providerData?.meta as { id?: string } | undefined)?.id

  return (
    <article className="space-y-6">
      <header>
        <Link
          href={
            parent
              ? `/admin/org/${slug}/ads/campaigns/${parent.id}`
              : `/admin/org/${slug}/ads/campaigns`
          }
          className="text-xs text-white/40 hover:text-white/60"
        >
          ← {parent ? parent.name : 'Campaigns'}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">{adSet.name}</h1>
        <div className="mt-1 text-sm text-white/50">
          {adSet.optimizationGoal.toLowerCase()} · {adSet.billingEvent.toLowerCase()} · {adSet.status.toLowerCase()}
          {metaId && <> · Meta id <code className="text-white/30">{metaId}</code></>}
        </div>
      </header>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-white/40">Targeting</h2>
        <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <div>
            <dt className="text-white/40">Countries</dt>
            <dd>{adSet.targeting.geo.countries?.join(', ') ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-white/40">Age range</dt>
            <dd>
              {adSet.targeting.demographics.ageMin}-{adSet.targeting.demographics.ageMax}
            </dd>
          </div>
          <div>
            <dt className="text-white/40">Genders</dt>
            <dd>{adSet.targeting.demographics.genders?.join(', ') ?? 'All'}</dd>
          </div>
          <div>
            <dt className="text-white/40">Placements</dt>
            <dd>
              {Object.entries(adSet.placements)
                .filter(([, v]) => v)
                .map(([k]) => k)
                .join(', ')}
            </dd>
          </div>
        </dl>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-white/40">Ads ({ads.length})</h2>
        <ul className="mt-2 divide-y divide-white/5 rounded border border-white/10">
          {ads.map((a) => (
            <li key={a.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <Link
                href={`/admin/org/${slug}/ads/ads/${a.id}`}
                className="font-medium hover:text-[#F5A623]"
              >
                {a.name} <span className="text-xs text-white/30">{a.format.toLowerCase()}</span>
              </Link>
              <span className="text-xs uppercase tracking-wide text-white/50">{a.status.toLowerCase()}</span>
            </li>
          ))}
        </ul>
      </section>
    </article>
  )
}
