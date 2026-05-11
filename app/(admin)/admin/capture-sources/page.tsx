// app/(admin)/admin/capture-sources/page.tsx
//
// Server component: lists lead-capture sources for the current admin scope
// and shows recent submission counts.

import Link from 'next/link'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { adminAuth, adminDb } from '@/lib/firebase/admin'
import {
  LEAD_CAPTURE_SOURCES,
  LEAD_CAPTURE_SUBMISSIONS,
  type CaptureSource,
} from '@/lib/lead-capture/types'
import { NewSourceButton } from '@/components/admin/capture-sources/NewSourceButton'

export const dynamic = 'force-dynamic'

interface RowVM extends CaptureSource {
  submissionCount: number
}

async function loadSources(uid: string): Promise<RowVM[]> {
  const userSnap = await adminDb.collection('users').doc(uid).get()
  const userData = userSnap.exists ? userSnap.data() ?? {} : {}
  const allowed: string[] = Array.isArray(userData.allowedOrgIds) ? userData.allowedOrgIds : []
  const home: string = typeof userData.orgId === 'string' ? userData.orgId : ''

  let baseQuery = adminDb.collection(LEAD_CAPTURE_SOURCES).limit(500) as FirebaseFirestore.Query
  if (allowed.length > 0) {
    const orgs = Array.from(new Set([...allowed, home].filter(Boolean)))
    if (orgs.length === 0) return []
    if (orgs.length <= 10) {
      baseQuery = baseQuery.where('orgId', 'in', orgs)
    }
  }
  const snap = await baseQuery.get()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let rows: CaptureSource[] = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }))
  rows = rows.filter((s) => s.deleted !== true)

  const counts: Record<string, number> = {}
  await Promise.all(
    rows.map(async (s) => {
      try {
        const c = await adminDb
          .collection(LEAD_CAPTURE_SUBMISSIONS)
          .where('captureSourceId', '==', s.id)
          .count()
          .get()
        counts[s.id] = c.data().count
      } catch {
        counts[s.id] = 0
      }
    }),
  )

  return rows
    .sort((a, b) => {
      const ams = (a.createdAt as { _seconds?: number; seconds?: number } | null)?._seconds
        ?? (a.createdAt as { seconds?: number } | null)?.seconds ?? 0
      const bms = (b.createdAt as { _seconds?: number; seconds?: number } | null)?._seconds
        ?? (b.createdAt as { seconds?: number } | null)?.seconds ?? 0
      return bms - ams
    })
    .map((s) => ({ ...s, submissionCount: counts[s.id] ?? 0 }))
}

export default async function CaptureSourcesPage() {
  const cookieStore = await cookies()
  const cookieName = process.env.SESSION_COOKIE_NAME ?? '__session'
  const sessionCookie = cookieStore.get(cookieName)?.value
  if (!sessionCookie) redirect('/login')
  let uid: string
  try {
    const decoded = await adminAuth.verifySessionCookie(sessionCookie, true)
    uid = decoded.uid
  } catch {
    redirect('/login')
  }

  const sources = await loadSources(uid)

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-on-surface">Lead Capture Sources</h1>
          <p className="text-sm text-on-surface-variant mt-1">
            Embeddable newsletter & lead-magnet forms with double opt-in and campaign auto-enrollment.
          </p>
        </div>
        <NewSourceButton />
      </div>

      {sources.length === 0 ? (
        <div className="text-center py-16 text-on-surface-variant">
          No capture sources yet. Click <strong>New capture source</strong> to create one.
        </div>
      ) : (
        <div className="space-y-2">
          {sources.map((s) => (
            <Link
              key={s.id}
              href={`/admin/capture-sources/${s.id}`}
              className="flex items-center justify-between p-4 rounded-xl bg-surface-container hover:bg-surface-container-high transition-colors"
            >
              <div className="min-w-0">
                <p className="font-medium text-on-surface truncate">{s.name}</p>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  {s.type} · {s.doubleOptIn === 'on' ? 'double opt-in' : 'single opt-in'} · {s.submissionCount} submissions
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    s.active
                      ? 'bg-green-100 text-green-800'
                      : 'bg-surface-container text-on-surface-variant'
                  }`}
                >
                  {s.active ? 'active' : 'inactive'}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
