import { notFound } from 'next/navigation'
import { adminDb } from '@/lib/firebase/admin'
import { serializeForClient } from '@/lib/campaigns/serialize'

export const dynamic = 'force-dynamic'

export default async function CampaignResearchTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const snap = await adminDb.collection('campaigns').doc(id).get()
  if (!snap.exists) notFound()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = serializeForClient(snap.data() as any)
  if (c.deleted) notFound()
  const r = c.research

  if (!r) {
    return (
      <div className="card p-10 text-center text-sm text-[var(--color-pib-text-muted)]">
        No research dossier yet. Run Phase 1 of the content-engine.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {r.taglines && (
        <section className="card p-6 space-y-3">
          <h2 className="text-lg font-semibold">Taglines</h2>
          {r.taglines.master && (
            <div>
              <p className="text-xs uppercase tracking-wide text-[var(--color-pib-text-muted)]">Master</p>
              <p className="text-xl">{r.taglines.master}</p>
            </div>
          )}
          {r.taglines.layered && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm pt-2">
              {Object.entries(r.taglines.layered as Record<string, string>).map(([k, v]) => (
                <div key={k}>
                  <p className="text-xs uppercase tracking-wide text-[var(--color-pib-text-muted)]">{k}</p>
                  <p>{v}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {r.audiences && r.audiences.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Audiences</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {r.audiences.map((a: any) => (
              <div key={a.id ?? a.label} className="card p-5 space-y-3">
                <h3 className="font-semibold">
                  {a.id ? <span className="text-[var(--color-pib-accent)]">{a.id}.</span> : null} {a.label}
                </h3>
                {a.painPoints?.length > 0 && (
                  <div>
                    <p className="text-xs text-[var(--color-pib-text-muted)] uppercase tracking-wide mb-1">Pain points</p>
                    <ul className="text-sm space-y-1 list-disc list-inside">
                      {a.painPoints.map((p: string, i: number) => (
                        <li key={i}>{p}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {a.topInsights?.length > 0 && (
                  <div>
                    <p className="text-xs text-[var(--color-pib-text-muted)] uppercase tracking-wide mb-1">Top insights</p>
                    <ul className="text-sm space-y-1 list-disc list-inside">
                      {a.topInsights.map((p: string, i: number) => (
                        <li key={i}>{p}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {a.language?.length > 0 && (
                  <div>
                    <p className="text-xs text-[var(--color-pib-text-muted)] uppercase tracking-wide mb-1">Language</p>
                    <div className="flex gap-1 flex-wrap">
                      {a.language.map((p: string, i: number) => (
                        <span
                          key={i}
                          className="text-xs px-2 py-1 rounded bg-[var(--color-pib-surface-2)] border border-[var(--color-pib-line)]"
                        >
                          {p}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {r.voice && (
        <section className="card p-6 space-y-3">
          <h2 className="text-lg font-semibold">Voice</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            {r.voice.do?.length > 0 && (
              <div>
                <p className="text-xs uppercase tracking-wide text-emerald-400 mb-1">Do</p>
                <ul className="space-y-1 list-disc list-inside">
                  {r.voice.do.map((p: string, i: number) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              </div>
            )}
            {r.voice.dont?.length > 0 && (
              <div>
                <p className="text-xs uppercase tracking-wide text-red-400 mb-1">Don&apos;t</p>
                <ul className="space-y-1 list-disc list-inside">
                  {r.voice.dont.map((p: string, i: number) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          {r.voice.sampleParagraph && (
            <div className="pt-3 border-t border-[var(--color-pib-line)]">
              <p className="text-xs uppercase tracking-wide text-[var(--color-pib-text-muted)] mb-1">Sample</p>
              <p className="italic text-sm">{r.voice.sampleParagraph}</p>
            </div>
          )}
        </section>
      )}

      {r.citations && r.citations.length > 0 && (
        <section className="card p-6 space-y-3">
          <h2 className="text-lg font-semibold">Citations</h2>
          <ul className="space-y-3 text-sm">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {r.citations.map((c: any, i: number) => (
              <li key={i} className="border-l-2 border-[var(--color-pib-accent)] pl-3">
                <p className="italic">&ldquo;{c.quote}&rdquo;</p>
                <p className="text-xs text-[var(--color-pib-text-muted)] mt-1">
                  {c.speaker ? `${c.speaker}, ` : ''}
                  {c.publication}
                  {c.url && (
                    <>
                      {' · '}
                      <a href={c.url} target="_blank" rel="noopener noreferrer" className="underline">
                        source
                      </a>
                    </>
                  )}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {r.confidence && (
        <p className="text-xs text-[var(--color-pib-text-muted)]">
          Research confidence: <span className="uppercase">{r.confidence}</span>
          {r.notes ? ` · ${r.notes}` : ''}
        </p>
      )}
    </div>
  )
}
