// app/(admin)/admin/org/[slug]/ads/ads/[id]/page.tsx
import Link from 'next/link'
import { resolveOrgIdBySlug } from '@/lib/organizations/resolve-by-slug'
import { getAd } from '@/lib/ads/ads/store'
import { getAdSet } from '@/lib/ads/adsets/store'

interface Params {
  slug: string
  id: string
}

export default async function AdDetailPage({
  params,
}: {
  params: Promise<Params>
}) {
  const { slug, id } = await params
  const orgId = await resolveOrgIdBySlug(slug)
  if (!orgId) return <div className="text-white/60">Org not found.</div>
  const ad = await getAd(id)
  if (!ad || ad.orgId !== orgId) return <div className="text-white/60">Ad not found.</div>
  const adSet = await getAdSet(ad.adSetId)
  const metaIds = ad.providerData?.meta as { adId?: string; creativeId?: string } | undefined

  return (
    <article className="space-y-6">
      <header>
        <Link
          href={
            adSet
              ? `/admin/org/${slug}/ads/ad-sets/${adSet.id}`
              : `/admin/org/${slug}/ads/campaigns`
          }
          className="text-xs text-white/40 hover:text-white/60"
        >
          ← {adSet ? adSet.name : 'Campaigns'}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">{ad.name}</h1>
        <div className="mt-1 text-sm text-white/50">
          {ad.format.toLowerCase()} · {ad.status.toLowerCase()}
          {metaIds?.adId && <> · Meta ad id <code className="text-white/30">{metaIds.adId}</code></>}
        </div>
      </header>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-white/40">Creative</h2>
        {ad.inlineImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={ad.inlineImageUrl}
            alt={ad.copy.headline ?? ad.name}
            className="mt-2 max-h-80 rounded border border-white/10"
          />
        )}
        <dl className="mt-3 space-y-2 text-sm">
          <div>
            <dt className="text-white/40 uppercase text-xs tracking-wide">Primary text</dt>
            <dd className="mt-0.5">{ad.copy.primaryText}</dd>
          </div>
          <div>
            <dt className="text-white/40 uppercase text-xs tracking-wide">Headline</dt>
            <dd className="mt-0.5">{ad.copy.headline}</dd>
          </div>
          {ad.copy.description && (
            <div>
              <dt className="text-white/40 uppercase text-xs tracking-wide">Description</dt>
              <dd className="mt-0.5">{ad.copy.description}</dd>
            </div>
          )}
          {ad.copy.callToAction && (
            <div>
              <dt className="text-white/40 uppercase text-xs tracking-wide">Call to action</dt>
              <dd className="mt-0.5">
                {ad.copy.callToAction.toLowerCase().replace(/_/g, ' ')} →{' '}
                <a
                  href={ad.copy.destinationUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[#F5A623] underline"
                >
                  {ad.copy.destinationUrl}
                </a>
              </dd>
            </div>
          )}
        </dl>
      </section>
    </article>
  )
}
