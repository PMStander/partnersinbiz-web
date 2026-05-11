// app/(admin)/admin/capture-sources/[id]/page.tsx
//
// Server shell. Loads the capture source + recent submissions + the org's
// sequences/campaigns lists used by the routing tab, then hands off to
// the client-side editor.

import { notFound } from 'next/navigation'
import { adminDb } from '@/lib/firebase/admin'
import {
  LEAD_CAPTURE_SOURCES,
  LEAD_CAPTURE_SUBMISSIONS,
  type CaptureSource,
  type CaptureSubmission,
} from '@/lib/lead-capture/types'
import type { Sequence } from '@/lib/sequences/types'
import type { Campaign } from '@/lib/campaigns/types'
import { CaptureSourceEditor } from '@/components/admin/capture-sources/CaptureSourceEditor'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ id: string }> }

async function loadSubmissions(sourceId: string): Promise<CaptureSubmission[]> {
  try {
    const snap = await adminDb
      .collection(LEAD_CAPTURE_SUBMISSIONS)
      .where('captureSourceId', '==', sourceId)
      .limit(50)
      .get()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return snap.docs.map((d: any) => ({ id: d.id, ...d.data() }))
  } catch {
    return []
  }
}

async function loadOrgOptions(orgId: string): Promise<{ sequences: Sequence[]; campaigns: Campaign[] }> {
  const [seqSnap, campSnap] = await Promise.all([
    adminDb.collection('sequences').where('orgId', '==', orgId).limit(200).get(),
    adminDb.collection('campaigns').where('orgId', '==', orgId).limit(200).get(),
  ])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sequences = seqSnap.docs.map((d: any) => ({ id: d.id, ...d.data() }) as Sequence).filter((s) => !s.deleted)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const campaigns = campSnap.docs.map((d: any) => ({ id: d.id, ...d.data() }) as Campaign).filter((c) => !c.deleted)
  return { sequences, campaigns }
}

export default async function CaptureSourceDetailPage({ params }: Props) {
  const { id } = await params
  const snap = await adminDb.collection(LEAD_CAPTURE_SOURCES).doc(id).get()
  if (!snap.exists || snap.data()?.deleted) notFound()
  const source = { id: snap.id, ...snap.data() } as CaptureSource

  const [submissions, options] = await Promise.all([
    loadSubmissions(id),
    loadOrgOptions(source.orgId),
  ])

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ??
    'https://partnersinbiz.online'

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <CaptureSourceEditor
        source={source}
        submissions={submissions}
        sequences={options.sequences}
        campaigns={options.campaigns}
        appUrl={appUrl}
      />
    </div>
  )
}
