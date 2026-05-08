import { notFound } from 'next/navigation'
import { adminDb } from '@/lib/firebase/admin'
import { serializeForClient } from '@/lib/campaigns/serialize'

export const dynamic = 'force-dynamic'

export default async function CampaignBrandTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const snap = await adminDb.collection('campaigns').doc(id).get()
  if (!snap.exists) notFound()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = serializeForClient(snap.data() as any)
  if (c.deleted) notFound()
  const brand = c.brandIdentity

  if (!brand) {
    return (
      <div className="card p-10 text-center text-sm text-[var(--color-pib-text-muted)]">
        Brand identity not yet locked. Run Phase 2 (master plan) of the content-engine.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <section className="card p-6 space-y-4">
        <h2 className="text-lg font-semibold">Palette</h2>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {Object.entries(brand.palette ?? {}).map(([key, hex]) => (
            <div key={key} className="space-y-1">
              <div
                className="h-16 rounded border border-[var(--color-pib-line)]"
                style={{ backgroundColor: hex as string }}
              />
              <p className="text-xs text-[var(--color-pib-text-muted)]">{key}</p>
              <p className="text-xs font-mono">{hex as string}</p>
            </div>
          ))}
        </div>
      </section>

      {brand.typography && (
        <section className="card p-6 space-y-3">
          <h2 className="text-lg font-semibold">Typography</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-xs text-[var(--color-pib-text-muted)] mb-1">Heading</p>
              <p style={{ fontFamily: brand.typography.heading }} className="text-2xl">
                Aa Bb Cc
              </p>
              <p className="text-xs font-mono mt-1">{brand.typography.heading}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--color-pib-text-muted)] mb-1">Body</p>
              <p style={{ fontFamily: brand.typography.body }}>The quick brown fox.</p>
              <p className="text-xs font-mono mt-1">{brand.typography.body}</p>
            </div>
            {brand.typography.numeric && (
              <div>
                <p className="text-xs text-[var(--color-pib-text-muted)] mb-1">Numeric</p>
                <p style={{ fontFamily: brand.typography.numeric }} className="text-2xl">
                  1234567890
                </p>
                <p className="text-xs font-mono mt-1">{brand.typography.numeric}</p>
              </div>
            )}
          </div>
        </section>
      )}

      {brand.tone && (
        <section className="card p-6 space-y-2">
          <h2 className="text-lg font-semibold">Tone</h2>
          <p className="text-sm">{brand.tone}</p>
        </section>
      )}

      {brand.aestheticKeywords && brand.aestheticKeywords.length > 0 && (
        <section className="card p-6 space-y-2">
          <h2 className="text-lg font-semibold">Aesthetic keywords</h2>
          <div className="flex gap-2 flex-wrap">
            {brand.aestheticKeywords.map((k: string) => (
              <span
                key={k}
                className="text-xs px-3 py-1 rounded-full bg-[var(--color-pib-surface-2)] border border-[var(--color-pib-line)]"
              >
                {k}
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
