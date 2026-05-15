# Client Documents Workspace Design

**Status:** approved design, ready for implementation planning.
**Date:** 2026-05-15.
**Owner:** Pip.
**Product area:** Partners in Biz client portal, admin workspace, agent skills.

## Purpose

Partners in Biz needs one client-facing document workspace for proposals, specs, reports, sign-offs, change requests, and strategy documents. It must feel like part of the PiB product, not like a static PDF or plain rich-text editor.

The module should give agents a reliable way to create a document for a client, place it into a consistent template, let the internal team review it, then let the client comment, suggest, edit where allowed, and approve the correct version. The system must record who approved, when they approved, which version they approved, and what legal or operational acceptance text was visible at that moment.

## Decisions

- Build a new generic `client_documents` module.
- Link documents to existing business objects instead of replacing them.
- Use structured templates with rich editable blocks.
- Allow standalone internal drafts, but require `orgId` before publishing to clients.
- Use approval mode by document type:
  - operational approval for specs, reports, launch sign-offs, and change requests.
  - formal acceptance for proposals and SOW-like documents.
- Allow client editing rights by template:
  - proposals and SOWs use comments and suggestions only.
  - intake and selected low-risk specs can allow direct client edits.
- Let agents draft with clearly marked assumptions when context is incomplete.
- Do not publish formal approval documents until required facts are resolved.

## Architecture

The document module is the collaboration and approval layer. Existing modules stay as the operational source of truth.

Examples:

- A website project remains in Projects/Kanban.
- A content campaign remains in `campaigns`.
- A monthly performance report remains in `reports`.
- A sales opportunity remains in CRM.
- A social post remains in `social_posts`.

Each of those records can link to one or more `client_documents`. The document owns presentation, comments, suggestions, versions, approvals, signatures, and share/client review state.

## First Templates

The initial template registry ships with seven templates:

1. Sales Proposal
2. Website/App Build Spec
3. Social Media Strategy
4. Content Campaign Plan
5. Monthly Report
6. Launch Sign-off
7. Change Request

The template registry must allow new templates later without schema changes. Future additions include SEO Sprint Plan, Email Campaign Plan, AI Agent Spec, Brand Kit, Retainer Review, Case Study Approval, and Handover Pack.

## Document Model

```ts
type ClientDocumentType =
  | 'sales_proposal'
  | 'build_spec'
  | 'social_strategy'
  | 'content_campaign_plan'
  | 'monthly_report'
  | 'launch_signoff'
  | 'change_request'

type ClientDocumentStatus =
  | 'internal_draft'
  | 'internal_review'
  | 'client_review'
  | 'changes_requested'
  | 'approved'
  | 'accepted'
  | 'archived'

type ApprovalMode = 'none' | 'operational' | 'formal_acceptance'

interface ClientDocument {
  id: string
  orgId?: string                 // required before publish/client review
  title: string
  type: ClientDocumentType
  templateId: string
  status: ClientDocumentStatus

  linked: {
    projectId?: string
    campaignId?: string
    reportId?: string
    dealId?: string
    seoSprintId?: string
    socialPostIds?: string[]
    invoiceId?: string
  }

  currentVersionId: string
  latestPublishedVersionId?: string
  approvalMode: ApprovalMode
  clientPermissions: {
    canComment: boolean
    canSuggest: boolean
    canDirectEdit: boolean
    canApprove: boolean
  }

  assumptions: DocumentAssumption[]
  shareToken: string
  shareEnabled: boolean

  createdAt: unknown
  createdBy: string
  createdByType: 'user' | 'agent' | 'system'
  updatedAt: unknown
  updatedBy: string
  updatedByType: 'user' | 'agent' | 'system'
  deleted: boolean
}

interface DocumentAssumption {
  id: string
  text: string
  severity: 'info' | 'needs_review' | 'blocks_publish'
  status: 'open' | 'resolved'
  blockId?: string
  createdBy: string
  createdAt: unknown
  resolvedBy?: string
  resolvedAt?: unknown
}
```

### Versions

Every meaningful edit creates or updates a draft version. Publishing to the client snapshots the currently visible blocks into a published version. Approval always points to a version id, never to a mutable document head.

```ts
interface ClientDocumentVersion {
  id: string
  documentId: string
  versionNumber: number
  status: 'draft' | 'published' | 'approved' | 'superseded'
  blocks: DocumentBlock[]
  theme: DocumentTheme
  createdAt: unknown
  createdBy: string
  createdByType: 'user' | 'agent' | 'system'
  changeSummary?: string
}

interface DocumentTheme {
  brandName?: string
  logoUrl?: string
  palette: {
    bg: string
    text: string
    accent: string
    muted?: string
  }
  typography: {
    heading: string
    body: string
  }
}
```

### Blocks

Templates define required and optional blocks. A block has structured metadata plus rich content.

```ts
type DocumentBlockType =
  | 'hero'
  | 'summary'
  | 'problem'
  | 'scope'
  | 'deliverables'
  | 'timeline'
  | 'investment'
  | 'terms'
  | 'approval'
  | 'metrics'
  | 'risk'
  | 'table'
  | 'gallery'
  | 'callout'
  | 'rich_text'

interface DocumentBlock {
  id: string
  type: DocumentBlockType
  title?: string
  content: unknown
  required: boolean
  locked?: boolean
  clientEditable?: boolean
  display: {
    variant?: string
    accent?: string
    motion?: 'none' | 'reveal' | 'sticky' | 'counter' | 'timeline'
  }
}
```

## Comments, Suggestions, and Edits

The module should reuse the existing inline comment concepts where practical:

- text anchors
- image/media anchors
- general document comments
- user role
- agent pickup fields

Documents add two collaboration types:

- **Suggestion:** a proposed replacement or insertion that must be accepted or rejected by an internal user unless the template allows direct client edits.
- **Direct edit:** allowed only for selected templates and selected blocks.

Comment and suggestion records live as subcollections under the document and always carry `versionId`. Old approvals can therefore resolve to the exact review context without duplicating the whole comment tree into every version snapshot.

```ts
interface DocumentComment {
  id: string
  documentId: string
  versionId: string
  blockId?: string
  text: string
  anchor?: { type: 'text'; text: string; offset?: number } | { type: 'image'; mediaUrl: string }
  userId: string
  userName: string
  userRole: 'admin' | 'client' | 'agent'
  status: 'open' | 'resolved'
  agentPickedUp: boolean
  createdAt: unknown
}

interface DocumentSuggestion {
  id: string
  documentId: string
  versionId: string
  blockId: string
  kind: 'replace_text' | 'insert_text' | 'delete_text' | 'replace_block'
  original: unknown
  proposed: unknown
  status: 'open' | 'accepted' | 'rejected'
  createdBy: string
  createdAt: unknown
  resolvedBy?: string
  resolvedAt?: unknown
}
```

## Approval and Acceptance

Operational approval records:

- approver user id
- display name
- role/company
- timestamp
- version id
- optional IP and user agent

Formal acceptance records add:

- acceptance checkbox text
- typed name
- signature-style capture if enabled
- terms block snapshot
- pricing/investment snapshot
- version id

Once a version is approved or accepted, that version is locked. A later change creates a new version and clears the published approval state until the new version is approved.

## UI

### Admin

Routes:

- `/admin/documents`
- `/admin/documents/new`
- `/admin/documents/[id]`
- `/admin/org/[slug]/documents`
- `/admin/org/[slug]/documents/[id]`

Admin views:

- document index with status, type, client, linked object, and approval state.
- template picker.
- editor with block canvas, review rail, assumptions panel, version history, and publish controls.
- approval audit view.

### Client Portal

Routes:

- `/portal/documents`
- `/portal/documents/[id]`
- `/d/[shareToken]` for share-token access when enabled.

Client views:

- polished scrollable document renderer.
- sticky progress and section navigation.
- inline comment and suggestion controls.
- selected direct editing where allowed.
- request changes.
- approval or formal acceptance panel.

The client document renderer should use brand-aware styling from the org brand profile where available. Motion should be purposeful: section reveal, progress, counters, timeline steps, and approval state transitions. It should not behave like a marketing landing page.

## API

Core routes:

```txt
GET    /api/v1/client-documents
POST   /api/v1/client-documents
GET    /api/v1/client-documents/[id]
PATCH  /api/v1/client-documents/[id]
POST   /api/v1/client-documents/[id]/publish
POST   /api/v1/client-documents/[id]/archive

GET    /api/v1/client-documents/[id]/versions
POST   /api/v1/client-documents/[id]/versions
GET    /api/v1/client-documents/[id]/versions/[versionId]

GET    /api/v1/client-documents/[id]/comments
POST   /api/v1/client-documents/[id]/comments
PATCH  /api/v1/client-documents/[id]/comments/[commentId]

GET    /api/v1/client-documents/[id]/suggestions
POST   /api/v1/client-documents/[id]/suggestions
POST   /api/v1/client-documents/[id]/suggestions/[suggestionId]/accept
POST   /api/v1/client-documents/[id]/suggestions/[suggestionId]/reject

POST   /api/v1/client-documents/[id]/approve
POST   /api/v1/client-documents/[id]/accept

GET    /api/v1/public/client-documents/[shareToken]
```

Agent-focused routes can use the same endpoints with `AI_API_KEY`, matching the existing platform skill pattern.

## Agent Workflow

When Peet says, "make a proposal/spec/document for Client X", the agent must:

1. Resolve the client org.
2. Select the best template.
3. Pull context from:
   - org profile and brand profile
   - project/task records
   - campaigns and social/content records
   - CRM deal/contact data
   - existing wiki/client notes
   - reports or analytics where relevant
4. Create an internal draft.
5. Mark assumptions inside the document.
6. Keep formal approval documents in internal review until required facts are resolved.
7. Publish to client review only when the template rules allow it.
8. Print the admin URL and client URL.

The agent should draft with assumptions for proposals and specs rather than stopping on every missing detail. It should not invent final prices, legal terms, or binding dates for formal acceptance documents.

## Skill Updates

Add a new git-versioned skill:

```txt
partnersinbiz-web/.claude/skills/client-documents/SKILL.md
```

Add it to `PLATFORM_SKILLS` in:

```txt
partnersinbiz-web/scripts/install-platform-skills.sh
```

Update related skills so agents link or create documents at the right moments:

- `content-engine`: create a Content Campaign Plan document for major campaign runs.
- `project-management`: attach specs, change requests, and launch sign-offs to projects.
- `client-manager`: surface document status in client handoff/review work.
- `crm-sales`: create Sales Proposal documents from CRM opportunities.
- `seo-sprint-manager`: create SEO Sprint Plan documents when strategy needs client sign-off.
- `social-media-manager`: link Social Media Strategy and content approval documents when campaigns need broader sign-off.

If a subagent edits a global skill at `~/.claude/skills`, manually copy it back to the git-versioned source under `partnersinbiz-web/.claude/skills/` and rerun:

```bash
bash partnersinbiz-web/scripts/install-platform-skills.sh
```

## Implementation Slices

1. **Foundation:** types, template registry, Firestore collections, and API CRUD.
2. **Renderer:** read-only branded document renderer for admin, portal, and share-token views.
3. **Editor:** block editor, assumptions panel, internal publish flow.
4. **Collaboration:** comments, suggestions, selected direct edits, activity/audit logging.
5. **Approvals:** operational approval and formal acceptance, version locking.
6. **Adapters:** project, campaign, report, CRM, and SEO links.
7. **Agent skill:** `client-documents` plus related skill updates and symlink install.

## Verification

The implementation should include tests for:

- template defaults and required blocks.
- tenant scoping.
- creating standalone internal drafts.
- blocking client publish without `orgId`.
- publishing snapshots into immutable versions.
- comments and suggestions tied to the correct version.
- operational approval version locking.
- formal acceptance snapshot capture.
- linked object filters.
- share-token public access stripping private fields.

Manual verification should cover:

- admin creates a Sales Proposal from a template.
- agent-created draft shows assumptions.
- internal user publishes to client review.
- client comments on text.
- client suggests an edit.
- admin accepts suggestion and republishes.
- client formally accepts the published version.
- later edit creates a new version and does not mutate the accepted version.

## Open Constraints

- The first implementation should not become a full Google Docs replacement.
- Pricing and legal text must be template-controlled for formal acceptance documents.
- Existing project/campaign/report records stay canonical for operations.
- Approved versions must remain readable even if the current document changes later.
- Public share routes must never expose internal comments, assumptions marked internal, or unpublished versions.
