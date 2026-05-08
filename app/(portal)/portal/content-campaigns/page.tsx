import Link from 'next/link'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { adminDb, adminAuth } from '@/lib/firebase/admin'
import { serializeForClient } from '@/lib/campaigns/serialize'

export const dynamic = 'force-dynamic'

const STATUS_PILL: Record<string, string> = {
  draft: 'bg-gray-700 text-gray-100',
  in_review: 'bg-amber-700 text-amber-50',
  approved: 'bg-emerald-700 text-emerald-50',
  shipping: 'bg-violet-700 text-violet-50',
  archived: 'bg-zinc-800 text-zinc-300',
}

async function currentUser(): Promise<{ uid: string; orgId?: string } | null> {
  const cookieStore = await cookies()
  const cookieName = process.env.SESSION_COOKIE_NAME ?? '__session'
  const session = cookieStore.get(cookieName)?.value
  if (!session) return null
  try {
    const decoded = await adminAuth.verifySessionCookie(session, true)
    const userDoc = await adminDb.collection('users').doc(decoded.uid).get()
    return { uid: decoded.uid, orgId: userDoc.data()?.orgId }
  } catch {
    return null
  }
}

export default async function PortalContentCampaignsIndex() {
  const user = await currentUser()
  if (!user) redirect('/login')
  if (!user.orgId) {
    return <div className="card p-10 text-center text-sm">No organisation linked to this account.</div>
  }

  const snap = await adminDb
    .collection('campaigns')
    .where('orgId', '==', user.orgId)
    .where('deleted', '==', false)
    .get()

  const campaigns = snap.docs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((d) => serializeForClient({ id: d.id, ...(d.data() as any) }))
    // Only content-engine campaigns. Filter out legacy email campaigns sharing the collection.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((c: any) => c.clientType || c.brandIdentity || c.research)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .sort((a: any, b: any) => {
      const at = a.createdAt ? new Date(a.createdAt).getTime() : 0
      const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0
      return bt - at
    })

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Your content campaigns</h1>
        <p className="text-sm text-[var(--color-pib-text-muted)]">
          Review, approve, or request changes on every blog, video, and social post.
        </p>
      </header>

      {campaigns.length === 0 ? (
        <div className="card p-10 text-center text-sm text-[var(--color-pib-text-muted)]">
          No campaigns yet. Your account team will let you know when there&apos;s content to review.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {campaigns.map((c: any) => (
            <Link
              key={c.id}
              href={`/portal/content-campaigns/${c.id}`}
              className="card p-5 hover:bg-[var(--color-row-hover)] block"
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-lg font-semibold leading-tight">{c.name}</h2>
                <span
                  className={`text-[10px] px-2 py-1 rounded uppercase tracking-wide ${
                    STATUS_PILL[c.status] ?? 'bg-gray-800 text-gray-300'
                  }`}
                >
                  {c.status}
                </span>
              </div>
              <p className="text-xs text-[var(--color-pib-text-muted)] mt-1">{c.clientType ?? '—'}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
