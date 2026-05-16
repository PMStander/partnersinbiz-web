// app/(admin)/admin/org/[slug]/ads/connections/page.tsx
import { ConnectionsPanel } from '@/components/ads/ConnectionsPanel'
import { listConnections } from '@/lib/ads/connections/store'
import { adminDb } from '@/lib/firebase/admin'

interface Params {
  slug: string
}

async function resolveOrgIdBySlug(slug: string): Promise<string | null> {
  const snap = await adminDb
    .collection('organizations')
    .where('slug', '==', slug)
    .limit(1)
    .get()
  if (snap.docs.length === 0) return null
  return snap.docs[0].id
}

export default async function ConnectionsPage({
  params,
}: {
  params: Promise<Params>
}) {
  const { slug } = await params
  const orgId = await resolveOrgIdBySlug(slug)
  if (!orgId) {
    return <div className="text-white/60">Org not found.</div>
  }
  const connections = await listConnections({ orgId })
  // Strip secrets before passing to the client component
  const safe = connections.map(({ accessTokenEnc, refreshTokenEnc, ...rest }) => rest as any)
  return <ConnectionsPanel orgSlug={slug} orgId={orgId} connections={safe} />
}
