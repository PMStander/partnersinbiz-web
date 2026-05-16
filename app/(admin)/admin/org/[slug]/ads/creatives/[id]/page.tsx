import Link from 'next/link'
import { resolveOrgIdBySlug } from '@/lib/organizations/resolve-by-slug'
import { getCreative } from '@/lib/ads/creatives/store'
import { listAds } from '@/lib/ads/ads/store'

interface Params {
  slug: string
  id: string
}

export default async function CreativeDetailPage({
  params,
}: {
  params: Promise<Params>
}) {
  const { slug, id } = await params
  const orgId = await resolveOrgIdBySlug(slug)
  if (!orgId) return <div className="text-white/60">Org not found.</div>
  const c = await getCreative(id)
  if (!c || c.orgId !== orgId) return <div className="text-white/60">Creative not found.</div>
  const allAds = await listAds({ orgId })
  const usingAds = allAds.filter((a) => a.creativeIds.includes(id))

  return (
    <article className="space-y-6">
      <header>
        <Link
          href={`/admin/org/${slug}/ads/creatives`}
          className="text-xs text-white/40 hover:text-white/60"
        >
          ← Creative library
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">{c.name}</h1>
        <div className="mt-1 text-sm text-white/50">
          {c.type} · {c.status.toLowerCase()} · {(c.fileSize / 1024).toFixed(0)} KB
          {c.width != null && c.height != null && ` · ${c.width}×${c.height}`}
          {c.duration != null && c.duration > 0 && ` · ${c.duration}s`}
        </div>
      </header>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-white/40">Preview</h2>
        <div className="mt-2">
          {c.type === 'video' ? (
            <video src={c.sourceUrl} controls className="max-h-96 rounded border border-white/10" />
          ) : c.previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.previewUrl} alt={c.name} className="max-h-96 rounded border border-white/10" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.sourceUrl} alt={c.name} className="max-h-96 rounded border border-white/10" />
          )}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-white/40">Platform sync</h2>
        <dl className="mt-2 space-y-1 text-sm">
          {(['meta', 'google', 'linkedin', 'tiktok'] as const).map((p) => {
            const ref = c.platformRefs[p]
            return (
              <div key={p} className="flex items-center gap-2">
                <dt className="capitalize w-24 text-white/50">{p}</dt>
                <dd>
                  {ref ? (
                    <code className="text-xs text-white/70">{ref.creativeId}</code>
                  ) : (
                    <span className="text-xs text-white/30">not synced</span>
                  )}
                </dd>
              </div>
            )
          })}
        </dl>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-white/40">
          Used by {usingAds.length} {usingAds.length === 1 ? 'ad' : 'ads'}
        </h2>
        {usingAds.length === 0 ? (
          <p className="mt-2 text-sm text-white/40">Not yet referenced by any ad.</p>
        ) : (
          <ul className="mt-2 divide-y divide-white/5 rounded border border-white/10">
            {usingAds.map((a) => (
              <li key={a.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <Link
                  href={`/admin/org/${slug}/ads/ads/${a.id}`}
                  className="hover:text-[#F5A623]"
                >
                  {a.name}
                </Link>
                <span className="text-xs uppercase tracking-wide text-white/50">{a.status.toLowerCase()}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {c.lastError && (
        <section className="rounded border border-red-500/30 bg-red-500/5 p-4 text-sm">
          <div className="font-medium text-red-300">Last error</div>
          <div className="mt-1 text-xs text-white/60">{c.lastError}</div>
        </section>
      )}
    </article>
  )
}
