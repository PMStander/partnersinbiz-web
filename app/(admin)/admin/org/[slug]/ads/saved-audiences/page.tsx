import Link from 'next/link'
import { resolveOrgIdBySlug } from '@/lib/organizations/resolve-by-slug'
import { listSavedAudiences } from '@/lib/ads/saved-audiences/store'

interface Params { slug: string }

export default async function SavedAudiencesPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params
  const orgId = await resolveOrgIdBySlug(slug)
  if (!orgId) return <div className="text-white/60">Org not found.</div>
  const sas = await listSavedAudiences({ orgId })

  return (
    <section className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Saved audiences</h1>
          <p className="text-sm text-white/60 mt-1">
            Reusable targeting templates. Apply in one click on any ad set.
          </p>
        </div>
        <Link href={`/admin/org/${slug}/ads/saved-audiences/new`} className="btn-pib-accent text-sm">
          New saved audience
        </Link>
      </header>

      {sas.length === 0 ? (
        <div className="rounded-lg border border-dashed border-white/10 p-8 text-center">
          <p className="text-white/60">No saved audiences yet.</p>
        </div>
      ) : (
        <ul className="divide-y divide-white/5 rounded-lg border border-white/10">
          {sas.map((sa) => (
            <li key={sa.id} className="px-5 py-4">
              <div className="font-medium">{sa.name}</div>
              {sa.description && (
                <div className="mt-0.5 text-xs text-white/40">{sa.description}</div>
              )}
              <div className="mt-1 text-xs text-white/50">
                {sa.targeting.geo.countries?.join(', ') ?? '—'} · age {sa.targeting.demographics.ageMin}-{sa.targeting.demographics.ageMax}
                {sa.targeting.customAudiences?.include?.length ? ` · ${sa.targeting.customAudiences.include.length} CA include` : ''}
                {sa.targeting.customAudiences?.exclude?.length ? ` · ${sa.targeting.customAudiences.exclude.length} CA exclude` : ''}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
