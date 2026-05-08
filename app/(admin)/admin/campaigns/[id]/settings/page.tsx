import { notFound } from 'next/navigation'
import { adminDb } from '@/lib/firebase/admin'
import { serializeForClient } from '@/lib/campaigns/serialize'

export const dynamic = 'force-dynamic'

export default async function CampaignSettingsTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const snap = await adminDb.collection('campaigns').doc(id).get()
  if (!snap.exists) notFound()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = serializeForClient(snap.data() as any)
  if (c.deleted) notFound()

  const shareUrl = c.shareToken ? `/c/${c.shareToken}` : null

  return (
    <div className="space-y-6">
      <section className="card p-6 space-y-3">
        <h2 className="text-lg font-semibold">Identity</h2>
        <Field label="Campaign id" value={c.id} mono />
        <Field label="Org id" value={c.orgId} mono />
        <Field label="Client type" value={c.clientType ?? '—'} />
        <Field label="Status" value={c.status ?? '—'} />
        <Field label="Created" value={c.createdAt ?? '—'} />
        <Field label="Last updated" value={c.updatedAt ?? '—'} />
      </section>

      <section className="card p-6 space-y-3">
        <h2 className="text-lg font-semibold">Public preview</h2>
        {shareUrl ? (
          <>
            <Field label="Status" value={c.shareEnabled === false ? 'disabled' : 'enabled'} />
            <Field label="Path" value={shareUrl} mono />
            <a
              href={shareUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-sm px-4 py-2 rounded bg-[var(--color-pib-accent)] text-black hover:bg-[var(--color-pib-accent-hover)] font-medium"
            >
              Open public preview ↗
            </a>
          </>
        ) : (
          <p className="text-sm text-[var(--color-pib-text-muted)]">No share token on this campaign.</p>
        )}
      </section>

      <section className="card p-6 space-y-3">
        <h2 className="text-lg font-semibold">Danger zone</h2>
        <form action={`/api/v1/campaigns/${id}/archive`} method="POST">
          <button
            formAction={`/api/v1/campaigns/${id}/archive`}
            className="text-sm px-4 py-2 rounded border border-red-500 text-red-400 hover:bg-red-950"
          >
            Archive campaign
          </button>
        </form>
      </section>
    </div>
  )
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-3 gap-2 text-sm">
      <p className="text-[var(--color-pib-text-muted)]">{label}</p>
      <p className={`col-span-2 ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  )
}
