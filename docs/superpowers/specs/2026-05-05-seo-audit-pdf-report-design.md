# SEO Audit PDF Report

**Date:** 2026-05-05
**Endpoint:** `GET /api/v1/seo/audits/[id]/report.pdf`
**Status:** Stub (501) → implement

---

## Goal

Return a downloadable PDF for a given audit snapshot. The PDF combines rolled-up stats already stored on the audit doc with a top-20 keyword table fetched from `seo_keywords`.

---

## Data Sources

| Source | Collection / Field | Purpose |
|---|---|---|
| Audit doc | `seo_audits/{id}` | traffic, rankings, authority, content stats |
| Sprint doc | `seo_sprints/{sprintId}` | client name, site URL |
| Keywords | `seo_keywords` where `sprintId==` + `deleted==false` orderBy `currentPosition` limit 20 | keyword table |

---

## PDF Layout

Single document, one or more pages depending on keyword count.

1. **Header bar** — PiB brand colour (`#4F46E5`), client name + site URL, title "SEO Audit Report", Sprint Day X/90, formatted capture date
2. **Traffic stats row** — 4 cards: Impressions · Clicks · CTR (%) · Avg Position
3. **Rankings strip** — 3 badges: Top 100 · Top 10 · Top 3
4. **Two-column row** — Authority (Referring Domains / Total Backlinks) + Content (Pages Indexed / Posts Published / Comparison Pages)
5. **Keywords table** — columns: # · Keyword · Position · Impressions · Clicks · CTR — top 20 by currentPosition, ascending

---

## Route Handler

File: `app/api/v1/seo/audits/[id]/report.pdf/route.ts`

- Auth: `withAuth('admin', ...)` — matches sibling GET route
- Steps:
  1. Fetch `seo_audits/{id}` — 404 if missing, 403 if orgId mismatch (non-AI role)
  2. Fetch `seo_sprints/{sprintId}` for siteName / client context
  3. Fetch top-20 keywords: `seo_keywords.where('sprintId','==').where('deleted','==',false).orderBy('currentPosition').limit(20)`
  4. Call `renderToBuffer(<AuditReportPDF .../>)`
  5. Return `new Response(buffer, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="audit-report.pdf"' }})`

---

## PDF Component

File: `lib/seo/pdf/AuditReport.tsx`

- Pure `@react-pdf/renderer` component (Document / Page / View / Text / StyleSheet)
- Typed props interface `AuditReportProps` — no Firestore imports, takes plain data objects
- Stateless; all data passed in from route handler

---

## Package Changes

- Install: `@react-pdf/renderer`
- `next.config.ts`: add `'@react-pdf/renderer'` to `serverExternalPackages` (prevents webpack from bundling Node-only canvas deps)

---

## Firestore Index

Query `seo_keywords` by `sprintId` + `deleted` + orderBy `currentPosition`. If a composite index doesn't exist, add it to `firestore.indexes.json` and deploy.

---

## Out of Scope

- Client-facing portal PDF download (portal UI button wiring)
- Email delivery of PDF
- Scheduled / automatic PDF generation
