import { resolveOrgIdBySlug } from '@/lib/organizations/resolve-by-slug'
import { listPixelConfigs } from '@/lib/ads/pixel-configs/store'
import { PixelConfigPanel } from '@/components/ads/PixelConfigPanel'

interface Params { slug: string }

export default async function PixelConfigPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params
  const orgId = await resolveOrgIdBySlug(slug)
  if (!orgId) return <div className="text-white/60">Org not found.</div>
  const rawConfigs = await listPixelConfigs({ orgId })
  // Strip secrets before passing to client
  const configs = rawConfigs.map((c) => {
    const safe = { ...c, meta: c.meta ? { ...c.meta } : undefined }
    if (safe.meta) delete (safe.meta as Record<string, unknown>).capiTokenEnc
    return safe
  })
  return <PixelConfigPanel orgId={orgId} orgSlug={slug} initialConfigs={configs} />
}
