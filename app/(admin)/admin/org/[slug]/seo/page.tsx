import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { adminDb } from '@/lib/firebase/admin'

export const dynamic = 'force-dynamic'

/**
 * Per-org SEO entry point. Resolves the active sprint for the selected org
 * and redirects to the cockpit. If no sprint exists, presents a create CTA
 * with the org details prefilled.
 */
export default async function OrgSeoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  // Resolve org by slug
  const orgSnap = await adminDb.collection('organizations').where('slug', '==', slug).limit(1).get()
  if (orgSnap.empty) notFound()
  const orgDoc = orgSnap.docs[0]
  const orgId = orgDoc.id
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const org = orgDoc.data() as any

  // Find active sprint for this org (deleted=false, sorted by createdAt desc)
  const sprintsSnap = await adminDb
    .collection('seo_sprints')
    .where('orgId', '==', orgId)
    .where('deleted', '==', false)
    .limit(1)
    .get()

  if (!sprintsSnap.empty) {
    const sprintId = sprintsSnap.docs[0].id
    redirect(`/admin/seo/sprints/${sprintId}`)
  }

  // No sprint yet — show create CTA
  return (
    <div className="space-y-6">
      <header>
        <p className="text-[10px] uppercase tracking-widest text-[var(--color-pib-text-muted)] mb-1">
          {org.name ?? slug} / SEO
        </p>
        <h1 className="text-2xl font-semibold">SEO Sprint</h1>
        <p className="text-sm text-[var(--color-pib-text-muted)] mt-1">
          A 90-day structured SEO sprint with daily tasks, automated diagnostics, and a Karpathy-style
          autoresearch loop that adapts when results stagnate.
        </p>
      </header>

      <div className="card p-8 space-y-6 max-w-2xl">
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Start a sprint for {org.name ?? slug}</h2>
          <p className="text-sm text-[var(--color-pib-text-muted)]">
            We&apos;ll seed 90 days of tasks from the proven Outrank-90 template, schedule daily Search
            Console pulls, and surface today&apos;s plan in the client portal.
          </p>
        </div>

        <ul className="space-y-2 text-sm text-[var(--color-pib-text-muted)]">
          <li className="flex gap-2">
            <span className="material-symbols-outlined text-[18px] text-[var(--color-pib-accent)]">check_circle</span>
            <span>Daily 06:00 SAST refresh — GSC + PageSpeed + Bing data</span>
          </li>
          <li className="flex gap-2">
            <span className="material-symbols-outlined text-[18px] text-[var(--color-pib-accent)]">check_circle</span>
            <span>Weekly autoresearch — detects stagnation, generates fix tasks</span>
          </li>
          <li className="flex gap-2">
            <span className="material-symbols-outlined text-[18px] text-[var(--color-pib-accent)]">check_circle</span>
            <span>Safe autopilot — drafts only, nothing publishes without your review</span>
          </li>
          <li className="flex gap-2">
            <span className="material-symbols-outlined text-[18px] text-[var(--color-pib-accent)]">check_circle</span>
            <span>Client portal view — they follow along with progress + wins</span>
          </li>
        </ul>

        <div className="flex gap-3 pt-2">
          <Link
            href={`/admin/seo/sprints/new?orgId=${encodeURIComponent(orgId)}&clientId=${encodeURIComponent(orgId)}&siteName=${encodeURIComponent(org.name ?? '')}`}
            className="px-4 py-2 rounded bg-black text-white text-sm hover:bg-gray-800"
          >
            Create SEO sprint
          </Link>
          <Link
            href="/admin/seo"
            className="px-4 py-2 rounded border border-[var(--color-pib-line)] text-sm hover:bg-white/[0.03]"
          >
            View all sprints
          </Link>
        </div>
      </div>
    </div>
  )
}
