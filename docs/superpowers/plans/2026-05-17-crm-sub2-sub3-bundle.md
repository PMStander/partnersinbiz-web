# CRM 2.0 Bundle — Sub-2 (Consolidation) + Sub-3 (Features) Mega-PR

**Goal:** Ship 4 high-value CRM upgrades in one coordinated bundle, executed with heavy subagent parallelism.

**Base SHA:** `297d3ea` (Sub-1 complete tag). **Working dir:** `/Users/peetstander/Cowork/Partners in Biz — Client Growth/partnersinbiz-web`

## The 4 features

### Sub-2 quick wins (consolidation — backend-only)
1. **Deal events → contact timeline** — write `activities` entry on every `deal.stage_changed` / `deal.won` / `deal.lost` (in addition to the existing audit log). Files: `app/api/v1/crm/deals/[id]/route.ts`.
2. **Quote → contactId + quote events → contact timeline** — add optional `contactId` to `Quote` type + POST body; write `activities` entry on `quote.created` / `quote.sent` / `quote.accepted` / `quote.rejected`. Files: `lib/quotes/types.ts`, `app/api/v1/quotes/route.ts`, `app/api/v1/quotes/[id]/route.ts`.

### Sub-3 features (UI + new endpoints)
3. **Pipeline kanban** — reuse `KanbanBoard.tsx` for deals; new `/portal/deals` page. Files: `app/(portal)/portal/deals/page.tsx` (new), maybe `components/crm/DealKanban.tsx` (new).
4. **Bulk operations** — `POST /api/v1/crm/contacts/bulk` accepting `{ ids: string[], patch: { assignedTo?, stage?, tags?, type? } }`. Reuses Firestore `batch()` pattern from `contacts/import`. UI: checkbox selection on contacts table + bulk action menu. Files: `app/api/v1/crm/contacts/bulk/route.ts` (new), `app/(portal)/portal/contacts/page.tsx` (modify).
5. **Saved views** — store filter configs in `crmViews[]` array on `orgMembers/{orgId}_{uid}` doc. API: `GET/POST/DELETE /api/v1/crm/saved-views`. UI: "Save view" button + dropdown on contacts page. Files: `app/api/v1/crm/saved-views/route.ts` (new), `app/api/v1/crm/saved-views/[id]/route.ts` (new), `app/(portal)/portal/contacts/page.tsx` (modify).

(Originally listed as 4 features but split saved-views and bulk-ops + contact-detail deals panel for clarity = 6 surfaces total.)

## Parallel execution plan

**Wave 1 (3 parallel sonnet subagents — disjoint file scopes):**
- **Agent A:** Deal events + Quote contactId + Quote events to timeline (3 routes touching deals/[id] + quotes root + quotes [id] + quote types). Backend only, ~6 routes/types touched.
- **Agent B:** Pipeline kanban — new portal page + components, drag-drop wire up via `KanbanBoard.tsx`.
- **Agent C:** Bulk operations API — new `/contacts/bulk` route + tests. NO UI changes (Wave 2 handles contacts page edits).

**Wave 2 (2 parallel sonnet subagents):**
- **Agent D:** Saved views — full backend + UI integration on contacts page.
- **Agent E:** Bulk ops UI — checkbox selection on contacts page + bulk action menu, consumes Agent C's API.
- **Agent F:** Deals panel on contact detail page — adds 3rd panel showing open deals via `?contactId=` filter.

(Wave 2 can have potential conflicts on `app/(portal)/portal/contacts/page.tsx` — D and E both modify it. Serialize those two within Wave 2, parallel F.)

**Wave 3: Final review + push.**

## Forward-looking constraints
- All new routes use `withCrmAuth(minRole)` per Sub-1 patterns
- Bulk ops require `withCrmAuth('member')` for now (admin-only for delete/export toggles applied)
- Saved views require `withCrmAuth('viewer')` for read, `member` for create/delete (each user owns their own views)
- All writes embed `MemberRef` snapshots
- Use `{ ...data, id }` spread order
- Tests: `stageAuth` pattern, distinct uids, where-respecting mocks

## Out of scope (defer to future PRs)
- Multi-pipeline (schema change too large)
- Contact merging (zero demand signal)
- Activity reminders (cross-cutting infra)
- Cross-entity search expansion (separate sprint)
- Segment-membership inverse index (separate sprint)
