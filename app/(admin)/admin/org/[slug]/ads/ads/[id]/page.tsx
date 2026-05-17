// app/(admin)/admin/org/[slug]/ads/ads/[id]/page.tsx
// Sub-3a Phase 2 Batch 4 — RSA asset view for Google ads added.
import Link from 'next/link'
import { resolveOrgIdBySlug } from '@/lib/organizations/resolve-by-slug'
import { getAd } from '@/lib/ads/ads/store'
import { getAdSet } from '@/lib/ads/adsets/store'
import type { RsaAssets } from '@/lib/ads/providers/google/ads'

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
  const googleProviderData = ad.providerData as { google?: { rsaAssets?: RsaAssets } } | undefined
  const rsaAssets = googleProviderData?.google?.rsaAssets as RsaAssets | undefined

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
          {ad.format.toLowerCase()} · {ad.status.toLowerCase()} · {ad.platform}
          {metaIds?.adId && <> · Meta ad id <code className="text-white/30">{metaIds.adId}</code></>}
        </div>
      </header>

      {/* Google RSA assets (read-only view) */}
      {ad.platform === 'google' && (
        <section className="space-y-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-white/40">RSA Assets</h2>

          {rsaAssets ? (
            <>
              <div>
                <h3 className="text-xs uppercase tracking-wide text-white/30 mb-2">
                  Headlines ({rsaAssets.headlines.length})
                </h3>
                <ul className="space-y-1">
                  {rsaAssets.headlines.map((h, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm">
                      <span className="text-white/30 text-xs w-4 text-right">{i + 1}</span>
                      <span>{h.text}</span>
                      <span
                        className={`ml-auto text-xs tabular-nums ${
                          h.text.length > 30 ? 'text-red-400' : 'text-white/30'
                        }`}
                      >
                        {h.text.length}/30
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="text-xs uppercase tracking-wide text-white/30 mb-2">
                  Descriptions ({rsaAssets.descriptions.length})
                </h3>
                <ul className="space-y-1">
                  {rsaAssets.descriptions.map((d, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm">
                      <span className="text-white/30 text-xs w-4 text-right">{i + 1}</span>
                      <span>{d.text}</span>
                      <span
                        className={`ml-auto text-xs tabular-nums ${
                          d.text.length > 90 ? 'text-red-400' : 'text-white/30'
                        }`}
                      >
                        {d.text.length}/90
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {(rsaAssets.path1 ?? rsaAssets.path2) && (
                <div>
                  <h3 className="text-xs uppercase tracking-wide text-white/30 mb-2">
                    Display URL paths
                  </h3>
                  <p className="text-sm text-white/70">
                    {[rsaAssets.path1, rsaAssets.path2].filter(Boolean).join(' / ')}
                  </p>
                </div>
              )}

              <div>
                <h3 className="text-xs uppercase tracking-wide text-white/30 mb-2">
                  Landing URLs
                </h3>
                <ul className="space-y-1">
                  {rsaAssets.finalUrls.map((url, i) => (
                    <li key={i} className="text-sm">
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#F5A623] underline break-all"
                      >
                        {url}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>

              <p className="text-xs text-white/30">
                Note: Google RSA assets cannot be edited in place. To change assets, remove this ad
                and create a new one.
              </p>
            </>
          ) : (
            <p className="text-sm text-white/40">
              RSA assets not stored locally — query Google Ads API for live data.
            </p>
          )}
        </section>
      )}

      {/* Meta / non-Google creative */}
      {ad.platform !== 'google' && (
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
      )}
    </article>
  )
}
