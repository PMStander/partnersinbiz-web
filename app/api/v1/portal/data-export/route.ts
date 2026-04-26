// GET /api/v1/portal/data-export?format=csv|json&from=YYYY-MM-DD&to=YYYY-MM-DD
//
// Stream-out of the client's own metrics rows. Trust signal: "your data is
// yours, not ours." Defaults to last 90 days, JSON.

import { NextRequest, NextResponse } from 'next/server'
import { withPortalAuth } from '@/lib/auth/portal-middleware'
import { adminDb } from '@/lib/firebase/admin'
import { listMetrics } from '@/lib/metrics/query'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

async function resolveOrgId(uid: string): Promise<string | null> {
  const userDoc = await adminDb.collection('users').doc(uid).get()
  const data = userDoc.data() as { orgId?: string } | undefined
  return data?.orgId ?? null
}

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

export const GET = withPortalAuth(async (req: NextRequest, uid: string) => {
  const orgId = await resolveOrgId(uid)
  if (!orgId) return NextResponse.json({ error: 'No org' }, { status: 404 })

  const url = new URL(req.url)
  const format = (url.searchParams.get('format') ?? 'json').toLowerCase()
  const today = new Date().toISOString().slice(0, 10)
  let from = url.searchParams.get('from') ?? ''
  let to = url.searchParams.get('to') ?? today
  if (!DATE_RE.test(from)) {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() - 90)
    from = d.toISOString().slice(0, 10)
  }
  if (!DATE_RE.test(to)) to = today

  const rows = await listMetrics({ orgId, from, to })

  const filename = `pib-metrics-${orgId}-${from}-to-${to}.${format === 'csv' ? 'csv' : 'json'}`

  if (format === 'csv') {
    const cols = ['date', 'propertyId', 'source', 'metric', 'value', 'currency', 'valueZar', 'dimension', 'dimensionValue']
    const lines = [cols.join(',')]
    for (const r of rows) {
      lines.push(cols.map((c) => csvEscape((r as unknown as Record<string, unknown>)[c])).join(','))
    }
    return new NextResponse(lines.join('\n'), {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${filename}"`,
      },
    })
  }

  return new NextResponse(JSON.stringify({ orgId, from, to, count: rows.length, rows }, null, 2), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
    },
  })
})
