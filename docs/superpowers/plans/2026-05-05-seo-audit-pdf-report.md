# SEO Audit PDF Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 501 stub at `GET /api/v1/seo/audits/[id]/report.pdf` with a real PDF download using `@react-pdf/renderer`.

**Architecture:** A pure React-PDF component (`lib/seo/pdf/AuditReport.tsx`) accepts typed props and renders the PDF layout. The route handler fetches three Firestore documents (audit, sprint, top-20 keywords), passes data to the component, calls `renderToBuffer`, and returns an `application/pdf` response. No client-side code involved.

**Tech Stack:** `@react-pdf/renderer` v4, Next.js App Router (server route handler), Firebase Admin SDK, TypeScript

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Create | `lib/seo/pdf/AuditReport.tsx` | React-PDF Document component + types |
| Modify | `app/api/v1/seo/audits/[id]/report.pdf/route.ts` | Fetch data, render PDF, return response |
| Modify | `next.config.ts` | Add `serverExternalPackages` for react-pdf |
| Modify | `firestore.indexes.json` | Add composite index for keyword sort query |

---

## Task 1: Install package and configure Next.js

**Files:**
- Modify: `next.config.ts`

- [ ] **Step 1: Install `@react-pdf/renderer`**

```bash
cd "/Users/peetstander/Cowork/Partners in Biz — Client Growth/partnersinbiz-web"
npm install @react-pdf/renderer
```

Expected: package added to `node_modules` and `package.json`.

- [ ] **Step 2: Update `next.config.ts` to externalize react-pdf from webpack**

Replace the entire file with:

```ts
import path from 'path'

const nextConfig = {
  turbopack: {
    root: path.resolve('.'),
  },
  transpilePackages: ['@partnersinbiz/analytics-js'],
  serverExternalPackages: ['@react-pdf/renderer'],
  async redirects() {
    return [
      { source: '/discover', destination: '/work', permanent: true },
      { source: '/products', destination: '/services/web-applications', permanent: true },
    ]
  },
}

export default nextConfig
```

- [ ] **Step 3: Verify TypeScript still compiles**

```bash
cd "/Users/peetstander/Cowork/Partners in Biz — Client Growth/partnersinbiz-web"
npx tsc --noEmit 2>&1 | head -30
```

Expected: 0 errors (or only pre-existing unrelated errors).

- [ ] **Step 4: Commit**

```bash
git add next.config.ts package.json package-lock.json
git commit -m "chore: install @react-pdf/renderer, add serverExternalPackages"
```

---

## Task 2: Add Firestore composite index for keyword sort

**Files:**
- Modify: `firestore.indexes.json`

The keyword query is: `where('sprintId','==',x).where('deleted','==',false).orderBy('currentPosition').limit(20)`
This needs a composite index on `sprintId ASC + deleted ASC + currentPosition ASC`.

- [ ] **Step 1: Open `firestore.indexes.json` and add the new index**

Locate the `"indexes"` array and add this entry:

```json
{
  "collectionGroup": "seo_keywords",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "sprintId",         "order": "ASCENDING" },
    { "fieldPath": "deleted",          "order": "ASCENDING" },
    { "fieldPath": "currentPosition",  "order": "ASCENDING" }
  ]
}
```

- [ ] **Step 2: Deploy the index**

```bash
cd "/Users/peetstander/Cowork/Partners in Biz — Client Growth/partnersinbiz-web"
npx firebase deploy --only firestore:indexes
```

Expected: `Deploy complete!` — index will be in "building" state for a few minutes; that's fine for now.

- [ ] **Step 3: Commit**

```bash
git add firestore.indexes.json
git commit -m "chore: add seo_keywords composite index for currentPosition sort"
```

---

## Task 3: Create the AuditReport PDF component

**Files:**
- Create: `lib/seo/pdf/AuditReport.tsx`

- [ ] **Step 1: Create the directory**

```bash
mkdir -p "/Users/peetstander/Cowork/Partners in Biz — Client Growth/partnersinbiz-web/lib/seo/pdf"
```

- [ ] **Step 2: Create `lib/seo/pdf/AuditReport.tsx`**

```tsx
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'

export interface AuditKeyword {
  keyword: string
  currentPosition: number | null
  currentImpressions: number
  currentClicks: number
}

export interface AuditReportProps {
  clientName: string
  siteUrl: string
  capturedAt: string
  sprintDay: number
  traffic: {
    impressions: number
    clicks: number
    ctr: number
    avgPosition: number
  }
  rankings: {
    top100: number
    top10: number
    top3: number
  }
  authority: {
    referringDomains: number
    totalBacklinks: number
  }
  content: {
    pagesIndexed: number
    postsPublished: number
    comparisonPagesLive: number
  }
  keywords: AuditKeyword[]
}

const BRAND = '#4F46E5'
const LIGHT = '#EEF2FF'
const GREY = '#6B7280'
const DARK = '#111827'

const s = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 9, color: DARK, padding: 32 },
  header: {
    backgroundColor: BRAND,
    borderRadius: 6,
    padding: '12 16',
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerLeft: { flex: 1 },
  headerTitle: { fontSize: 16, color: '#fff', fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  headerSub: { fontSize: 9, color: '#C7D2FE' },
  headerRight: { alignItems: 'flex-end' },
  headerDay: { fontSize: 22, color: '#fff', fontFamily: 'Helvetica-Bold' },
  headerDayLabel: { fontSize: 8, color: '#C7D2FE' },

  sectionTitle: { fontSize: 8, color: GREY, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, marginTop: 14 },

  row: { flexDirection: 'row', gap: 8 },
  statCard: { flex: 1, backgroundColor: LIGHT, borderRadius: 4, padding: '8 10' },
  statValue: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: BRAND },
  statLabel: { fontSize: 7.5, color: GREY, marginTop: 2 },

  badgeRow: { flexDirection: 'row', gap: 8, marginBottom: 0 },
  badge: { flex: 1, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 4, padding: '7 10', alignItems: 'center' },
  badgeValue: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: DARK },
  badgeLabel: { fontSize: 7.5, color: GREY, marginTop: 1 },

  twoCol: { flexDirection: 'row', gap: 8 },
  infoBox: { flex: 1, backgroundColor: '#F9FAFB', borderRadius: 4, padding: '8 10' },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  infoKey: { color: GREY, fontSize: 8 },
  infoVal: { fontFamily: 'Helvetica-Bold', fontSize: 8, color: DARK },

  table: { marginTop: 4 },
  tableHeader: { flexDirection: 'row', backgroundColor: BRAND, borderRadius: '2 2 0 0', padding: '4 6' },
  tableRow: { flexDirection: 'row', padding: '3 6', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  tableRowAlt: { flexDirection: 'row', padding: '3 6', backgroundColor: LIGHT, borderBottomWidth: 1, borderBottomColor: '#E0E7FF' },
  thKeyword: { width: '40%', color: '#fff', fontFamily: 'Helvetica-Bold', fontSize: 7.5 },
  thNum: { flex: 1, color: '#fff', fontFamily: 'Helvetica-Bold', fontSize: 7.5, textAlign: 'right' },
  tdKeyword: { width: '40%', fontSize: 7.5 },
  tdNum: { flex: 1, fontSize: 7.5, textAlign: 'right', color: GREY },

  footer: { marginTop: 'auto', borderTopWidth: 1, borderTopColor: '#E5E7EB', paddingTop: 6, flexDirection: 'row', justifyContent: 'space-between' },
  footerText: { fontSize: 7, color: GREY },
})

function fmt(n: number, decimals = 0) {
  return n.toLocaleString('en-US', { maximumFractionDigits: decimals })
}

function pct(n: number) {
  return (n * 100).toFixed(1) + '%'
}

export function AuditReportPDF(props: AuditReportProps) {
  const { clientName, siteUrl, capturedAt, sprintDay, traffic, rankings, authority, content, keywords } = props
  const date = new Date(capturedAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <Document title={`SEO Audit Report — ${clientName}`} author="Partners in Biz">
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={s.header}>
          <View style={s.headerLeft}>
            <Text style={s.headerTitle}>SEO Audit Report</Text>
            <Text style={s.headerSub}>{clientName}  ·  {siteUrl}</Text>
            <Text style={[s.headerSub, { marginTop: 4 }]}>{date}</Text>
          </View>
          <View style={s.headerRight}>
            <Text style={s.headerDay}>Day {sprintDay}</Text>
            <Text style={s.headerDayLabel}>of 90</Text>
          </View>
        </View>

        {/* Traffic */}
        <Text style={s.sectionTitle}>Traffic</Text>
        <View style={s.row}>
          <View style={s.statCard}><Text style={s.statValue}>{fmt(traffic.impressions)}</Text><Text style={s.statLabel}>Impressions</Text></View>
          <View style={s.statCard}><Text style={s.statValue}>{fmt(traffic.clicks)}</Text><Text style={s.statLabel}>Clicks</Text></View>
          <View style={s.statCard}><Text style={s.statValue}>{pct(traffic.ctr)}</Text><Text style={s.statLabel}>CTR</Text></View>
          <View style={s.statCard}><Text style={s.statValue}>{fmt(traffic.avgPosition, 1)}</Text><Text style={s.statLabel}>Avg Position</Text></View>
        </View>

        {/* Rankings */}
        <Text style={s.sectionTitle}>Rankings</Text>
        <View style={s.badgeRow}>
          <View style={s.badge}><Text style={s.badgeValue}>{rankings.top100}</Text><Text style={s.badgeLabel}>Top 100</Text></View>
          <View style={s.badge}><Text style={s.badgeValue}>{rankings.top10}</Text><Text style={s.badgeLabel}>Top 10</Text></View>
          <View style={s.badge}><Text style={s.badgeValue}>{rankings.top3}</Text><Text style={s.badgeLabel}>Top 3</Text></View>
        </View>

        {/* Authority + Content */}
        <Text style={s.sectionTitle}>Authority & Content</Text>
        <View style={s.twoCol}>
          <View style={s.infoBox}>
            <Text style={[s.infoKey, { fontFamily: 'Helvetica-Bold', marginBottom: 5 }]}>Authority</Text>
            <View style={s.infoRow}><Text style={s.infoKey}>Referring Domains</Text><Text style={s.infoVal}>{fmt(authority.referringDomains)}</Text></View>
            <View style={s.infoRow}><Text style={s.infoKey}>Total Backlinks</Text><Text style={s.infoVal}>{fmt(authority.totalBacklinks)}</Text></View>
          </View>
          <View style={s.infoBox}>
            <Text style={[s.infoKey, { fontFamily: 'Helvetica-Bold', marginBottom: 5 }]}>Content</Text>
            <View style={s.infoRow}><Text style={s.infoKey}>Pages Indexed</Text><Text style={s.infoVal}>{fmt(content.pagesIndexed)}</Text></View>
            <View style={s.infoRow}><Text style={s.infoKey}>Posts Published</Text><Text style={s.infoVal}>{fmt(content.postsPublished)}</Text></View>
            <View style={s.infoRow}><Text style={s.infoKey}>Comparison Pages Live</Text><Text style={s.infoVal}>{fmt(content.comparisonPagesLive)}</Text></View>
          </View>
        </View>

        {/* Keywords table */}
        {keywords.length > 0 && (
          <>
            <Text style={s.sectionTitle}>Top Keywords by Position</Text>
            <View style={s.table}>
              <View style={s.tableHeader}>
                <Text style={s.thKeyword}>Keyword</Text>
                <Text style={s.thNum}>Position</Text>
                <Text style={s.thNum}>Impressions</Text>
                <Text style={s.thNum}>Clicks</Text>
                <Text style={s.thNum}>CTR</Text>
              </View>
              {keywords.map((kw, i) => {
                const rowStyle = i % 2 === 0 ? s.tableRow : s.tableRowAlt
                const kwCtr = kw.currentImpressions > 0 ? kw.currentClicks / kw.currentImpressions : 0
                return (
                  <View key={i} style={rowStyle}>
                    <Text style={s.tdKeyword}>{kw.keyword}</Text>
                    <Text style={s.tdNum}>{kw.currentPosition != null ? fmt(kw.currentPosition, 1) : '—'}</Text>
                    <Text style={s.tdNum}>{fmt(kw.currentImpressions)}</Text>
                    <Text style={s.tdNum}>{fmt(kw.currentClicks)}</Text>
                    <Text style={s.tdNum}>{pct(kwCtr)}</Text>
                  </View>
                )
              })}
            </View>
          </>
        )}

        {/* Footer */}
        <View style={s.footer}>
          <Text style={s.footerText}>Partners in Biz — partnersinbiz.online</Text>
          <Text style={s.footerText}>Generated {date}</Text>
        </View>
      </Page>
    </Document>
  )
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd "/Users/peetstander/Cowork/Partners in Biz — Client Growth/partnersinbiz-web"
npx tsc --noEmit 2>&1 | head -30
```

Expected: 0 new errors.

- [ ] **Step 4: Commit**

```bash
git add lib/seo/pdf/AuditReport.tsx
git commit -m "feat: add AuditReportPDF react-pdf component"
```

---

## Task 4: Implement the route handler

**Files:**
- Modify: `app/api/v1/seo/audits/[id]/report.pdf/route.ts`

- [ ] **Step 1: Replace the stub with the real implementation**

```ts
import { NextRequest } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { createElement } from 'react'
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
        }),
      )

      // 5. Return PDF response
      return new Response(buffer, {
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
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "/Users/peetstander/Cowork/Partners in Biz — Client Growth/partnersinbiz-web"
npx tsc --noEmit 2>&1 | head -30
```

Expected: 0 new errors.

- [ ] **Step 3: Run a local build to catch any webpack/bundler issues**

```bash
cd "/Users/peetstander/Cowork/Partners in Biz — Client Growth/partnersinbiz-web"
npm run build 2>&1 | tail -30
```

Expected: `✓ Compiled successfully` with no errors. If `@react-pdf/renderer` canvas errors appear, confirm `serverExternalPackages` is set in `next.config.ts`.

- [ ] **Step 4: Commit**

```bash
git add app/api/v1/seo/audits/[id]/report.pdf/route.ts
git commit -m "feat: implement GET /api/v1/seo/audits/[id]/report.pdf PDF download"
```

---

## Task 5: Smoke test and push

- [ ] **Step 1: Start the dev server if not running**

```bash
cd "/Users/peetstander/Cowork/Partners in Biz — Client Growth/partnersinbiz-web"
npm run dev &
```

- [ ] **Step 2: Find a real audit ID to test with**

```bash
cd "/Users/peetstander/Cowork/Partners in Biz — Client Growth/partnersinbiz-web"
node -e "
const admin = require('firebase-admin');
// Use the already-initialised admin from the app if possible, else:
process.env.GOOGLE_APPLICATION_CREDENTIALS = '.service-account.json';
admin.initializeApp({ projectId: 'partners-in-biz-85059' });
admin.firestore().collection('seo_audits').limit(1).get().then(s => s.docs.forEach(d => console.log(d.id))).then(() => process.exit());
" 2>/dev/null || echo "Check Firestore console for an audit ID: https://console.firebase.google.com/project/partners-in-biz-85059/firestore/data/seo_audits"
```

- [ ] **Step 3: Hit the endpoint with curl**

Replace `<AUDIT_ID>` with a real audit doc ID. Replace `<AI_API_KEY>` with the value from `.env.local`.

```bash
curl -s -o /tmp/test-audit.pdf -w "%{http_code}" \
  -H "Authorization: Bearer <AI_API_KEY>" \
  "http://localhost:3000/api/v1/seo/audits/<AUDIT_ID>/report.pdf"
```

Expected: `200`. Then open the file:

```bash
open /tmp/test-audit.pdf
```

Expected: PDF opens with header, stat blocks, rankings, authority/content, keyword table.

- [ ] **Step 4: Push to main and verify Vercel build**

```bash
git push origin main
```

Watch the Vercel deployment dashboard or run:

```bash
cd "/Users/peetstander/Cowork/Partners in Biz — Client Growth/partnersinbiz-web"
npx vercel logs --follow 2>/dev/null || echo "Check https://vercel.com/dashboard for deployment status"
```

Expected: deployment succeeds with no build errors.
