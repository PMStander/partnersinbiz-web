import Link from 'next/link'
import { adminDb } from '@/lib/firebase/admin'
import { cookies } from 'next/headers'
import { adminAuth } from '@/lib/firebase/admin'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

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

export default async function PortalSeoIndex() {
  const user = await currentUser()
  if (!user) redirect('/login')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = adminDb.collection('seo_sprints').where('deleted', '==', false)
  if (user.orgId) q = q.where('orgId', '==', user.orgId)
  const snap = await q.get()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sprints = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }))

  if (sprints.length === 0) {
    return (
      <div className="card p-10 text-center max-w-xl mx-auto">
        <h1 className="text-2xl font-semibold mb-3">SEO</h1>
        <p className="text-sm text-[var(--color-pib-text-muted)]">
          No active SEO sprint yet. Your team will set one up shortly.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Your SEO Sprint{sprints.length > 1 ? 's' : ''}</h1>
        <p className="text-sm text-[var(--color-pib-text-muted)]">
          Track progress, performance, and impact over the 90-day plan and beyond.
        </p>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sprints.map((s) => {
          const day = s.currentDay ?? 0
          const phase = s.currentPhase ?? 0
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const impr = (s as any).health?.signals?.length ?? 0
          return (
            <Link
              key={s.id}
              href={`/portal/seo/sprints/${s.id}`}
              className="card p-5 space-y-2 hover:border-gray-400"
            >
              <div className="text-xs text-[var(--color-pib-text-muted)]">
                {phase === 4 ? `Compounding · Day ${day}` : `Day ${day} of 90`}
              </div>
              <h3 className="text-lg font-semibold">{s.siteName}</h3>
              <p className="text-xs text-[var(--color-pib-text-muted)] truncate">{s.siteUrl}</p>
              <p className="text-sm font-medium pt-2">
                {impr === 0 ? '✓ All systems normal' : `${impr} attention items`}
              </p>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
