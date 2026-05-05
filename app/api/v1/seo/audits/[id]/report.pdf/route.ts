import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { createElement } from 'react'
import type { ReactElement } from 'react'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiError, apiErrorFromException } from '@/lib/api/response'
import type { ApiUser } from '@/lib/api/types'
import { AuditReportPDF } from '@/lib/seo/pdf/AuditReport'
import type { AuditKeyword } from '@/lib/seo/pdf/AuditReport'

export const dynamic = 'force-dynamic'

export const GET = withAuth(
  'admin',
  async (_req: NextRequest, user: ApiUser, ctx: { params: Promise<{ id: string }> }) => {
    try {
      const { id } = await ctx.params

      // 1. Fetch audit doc
      const auditSnap = await adminDb.collection('seo_audits').doc(id).get()
      if (!auditSnap.exists) return apiError('Audit not found', 404)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const audit = auditSnap.data() as any
      if (user.role !== 'ai' && audit.orgId !== user.orgId) return apiError('Access denied', 403)

      // 2. Fetch sprint doc for client context
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let sprint: any = {}
      if (audit.sprintId) {
        const sprintSnap = await adminDb.collection('seo_sprints').doc(audit.sprintId).get()
        if (sprintSnap.exists) sprint = sprintSnap.data()
      }

      // 3. Fetch top 20 keywords by currentPosition
      const kwSnap = await adminDb
        .collection('seo_keywords')
        .where('sprintId', '==', audit.sprintId ?? '')
        .where('deleted', '==', false)
        .orderBy('currentPosition', 'asc')
        .limit(20)
        .get()

      const keywords: AuditKeyword[] = kwSnap.docs.map((d) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const kw = d.data() as any
        return {
          keyword: kw.keyword ?? '',
          currentPosition: kw.currentPosition ?? null,
          currentImpressions: kw.currentImpressions ?? 0,
          currentClicks: kw.currentClicks ?? 0,
        }
      })

      // 4. Render PDF
      const buffer = await renderToBuffer(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        createElement(AuditReportPDF, {
          clientName: sprint.siteName ?? sprint.orgId ?? audit.orgId ?? 'Client',
          siteUrl: sprint.siteUrl ?? '',
          capturedAt: audit.capturedAt ?? new Date().toISOString(),
          sprintDay: audit.snapshotDay ?? 0,
          traffic: audit.traffic ?? { impressions: 0, clicks: 0, ctr: 0, avgPosition: 0 },
          rankings: audit.rankings ?? { top100: 0, top10: 0, top3: 0 },
          authority: audit.authority ?? { referringDomains: 0, totalBacklinks: 0 },
          content: audit.content ?? { pagesIndexed: 0, postsPublished: 0, comparisonPagesLive: 0 },
          keywords,
        }) as ReactElement<any>, // eslint-disable-line @typescript-eslint/no-explicit-any
      )

      // 5. Return PDF response
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="audit-report-day-${audit.snapshotDay ?? 0}.pdf"`,
          'Cache-Control': 'no-store',
        },
      })
    } catch (err) {
      return apiErrorFromException(err)
    }
  },
)
