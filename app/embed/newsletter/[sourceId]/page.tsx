// app/embed/newsletter/[sourceId]/page.tsx
//
// Full-page form rendering of the newsletter widget. Designed to be loaded
// inside an <iframe> on any client site. The /embed layout supplies a
// transparent body so the host site's background shows through.

import { notFound } from 'next/navigation'
import { adminDb } from '@/lib/firebase/admin'
import {
  LEAD_CAPTURE_SOURCES,
  type CaptureSource,
} from '@/lib/lead-capture/types'
import { LeadCaptureEmbedForm } from '@/components/lead-capture/LeadCaptureEmbedForm'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ sourceId: string }> }

export default async function NewsletterEmbedPage({ params }: Props) {
  const { sourceId } = await params
  const snap = await adminDb.collection(LEAD_CAPTURE_SOURCES).doc(sourceId).get()
  if (!snap.exists || snap.data()?.deleted) notFound()
  const source = { id: snap.id, ...snap.data() } as CaptureSource

  if (!source.active) {
    return (
      <div style={{ padding: 24, color: '#475569', fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, Arial, sans-serif' }}>
        This signup form is not active.
      </div>
    )
  }

  const fields = source.fields ?? []
  const submitUrl = `/api/embed/newsletter/${encodeURIComponent(source.id)}/submit`

  return (
    <div style={{ padding: 16, background: 'transparent', fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, Arial, sans-serif' }}>
      <LeadCaptureEmbedForm
        sourceId={source.id}
        theme={source.widgetTheme}
        fields={fields}
        successMessage={source.successMessage}
        successRedirectUrl={source.successRedirectUrl ?? ''}
        submitUrl={submitUrl}
      />
    </div>
  )
}
