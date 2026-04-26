// /api/v1/reports/:id
//   GET    — fetch one
//   PATCH  — edit exec_summary / highlights / status
//   DELETE — soft-delete (archive)

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { getReport, patchReport } from '@/lib/reports/generate'
import { adminDb } from '@/lib/firebase/admin'
import { REPORTS_COLLECTION, type Report } from '@/lib/reports/types'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

export const GET = withAuth('admin', async (_req: NextRequest, _user, ctx) => {
  const { id } = await (ctx as RouteContext).params
  const report = await getReport(id)
  if (!report) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ok: true, report })
})

interface PatchBody {
  exec_summary?: string
  highlights?: string[]
  status?: Report['status']
}

export const PATCH = withAuth('admin', async (req: NextRequest, _user, ctx) => {
  const { id } = await (ctx as RouteContext).params
  const body = (await req.json().catch(() => ({}))) as PatchBody
  const allowed: Pick<Report, 'exec_summary' | 'highlights' | 'status'> = {} as never
  if (typeof body.exec_summary === 'string') (allowed as Record<string, unknown>).exec_summary = body.exec_summary
  if (Array.isArray(body.highlights)) (allowed as Record<string, unknown>).highlights = body.highlights.map(String).slice(0, 8)
  if (body.status) (allowed as Record<string, unknown>).status = body.status
  await patchReport(id, allowed)
  const updated = await getReport(id)
  return NextResponse.json({ ok: true, report: updated })
})

export const DELETE = withAuth('admin', async (_req: NextRequest, _user, ctx) => {
  const { id } = await (ctx as RouteContext).params
  await adminDb.collection(REPORTS_COLLECTION).doc(id).update({ status: 'archived' })
  return NextResponse.json({ ok: true })
})
