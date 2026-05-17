import { resolveOrgIdBySlug } from '@/lib/organizations/resolve-by-slug'
import { NewAudienceClient } from './NewAudienceClient'

interface Params { slug: string }

export default async function NewAudiencePage({ params }: { params: Promise<Params> }) {
  const { slug } = await params
  const orgId = await resolveOrgIdBySlug(slug)
  if (!orgId) return <div className="text-white/60">Org not found.</div>
  return <NewAudienceClient orgId={orgId} orgSlug={slug} />
}
