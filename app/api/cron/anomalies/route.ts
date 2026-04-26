// /api/cron/anomalies — nightly anomaly check.
//
// For each active client org, evaluate yesterday's metrics against the
// trailing 14-day median + MAD baseline. Records each anomaly as a
// notification and emails the org owner + Peet.
//
// Auth: Bearer ${CRON_SECRET}

import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { detectAnomalies, recordAnomaly, type Anomaly } from '@/lib/metrics/anomaly'
import { getResendClient, FROM_ADDRESS } from '@/lib/email/resend'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

interface Summary {
  total: number
  anomalies: number
  emailsSent: number
  byOrg: Record<string, number>
}

async function notifyByEmail(orgId: string, anomalies: Anomaly[]): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) return false
  const orgDoc = await adminDb.collection('organizations').doc(orgId).get()
  const orgData = orgDoc.data() as { name?: string; ownerEmail?: string } | undefined
  if (!orgData?.ownerEmail) return false

  const lines = anomalies.map(
    (a) =>
      `• ${a.direction === 'up' ? 'Spike' : 'Drop'} in ${a.metric} on ${a.date} — ${a.value.toFixed(2)} vs baseline ${a.baselineMedian.toFixed(2)} (z=${a.modifiedZ.toFixed(2)}). Source ${a.source}, property ${a.propertyId}.`,
  )

  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#0A0A0B;color:#EDEDED;padding:32px">
    <h1 style="font-family:Georgia,serif;color:#F5A623;font-weight:400;margin-top:0">Anomaly alert — ${orgData.name ?? orgId}</h1>
    <p style="font-size:14px;color:#cccccc">${anomalies.length} metric${anomalies.length === 1 ? '' : 's'} crossed the alert threshold.</p>
    <ul style="font-size:14px;line-height:1.6">${lines.map((l) => `<li>${l}</li>`).join('')}</ul>
    <p style="font-size:12px;color:#888;margin-top:32px">Modified z-score uses median + MAD over the trailing 14 days. Threshold ~3.5σ for revenue, 4.0σ for traffic.</p>
  </body></html>`

  try {
    const resend = getResendClient()
    await resend.emails.send({
      from: FROM_ADDRESS,
      to: [orgData.ownerEmail, FROM_ADDRESS],
      subject: `Anomaly alert · ${orgData.name ?? orgId} · ${anomalies[0].date}`,
      html,
      text: `${anomalies.length} metric anomalies detected:\n\n${lines.join('\n')}`,
    })
    return true
  } catch (err) {
    console.error('[anomalies] email failed:', err)
    return false
  }
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const onlyOrgId = url.searchParams.get('orgId')
  const date = url.searchParams.get('date') ?? undefined // 'YYYY-MM-DD' optional override

  const orgsSnap = onlyOrgId
    ? await adminDb.collection('organizations').where('__name__', '==', onlyOrgId).get()
    : await adminDb.collection('organizations').where('type', '==', 'client').get()

  const summary: Summary = { total: 0, anomalies: 0, emailsSent: 0, byOrg: {} }

  for (const orgDoc of orgsSnap.docs) {
    const data = orgDoc.data() as { status?: string }
    if (data.status === 'churned' || data.status === 'suspended') continue
    summary.total += 1

    const findings = await detectAnomalies({ orgId: orgDoc.id, date })
    if (findings.length === 0) continue

    summary.anomalies += findings.length
    summary.byOrg[orgDoc.id] = findings.length
    for (const f of findings) {
      try { await recordAnomaly(f) } catch (err) { console.error('[anomalies] record', err) }
    }

    const sent = await notifyByEmail(orgDoc.id, findings)
    if (sent) summary.emailsSent += 1
  }

  return NextResponse.json({ ok: true, ...summary })
}
