# Client Documents Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the generic Client Documents module for proposals, specs, reports, strategy documents, sign-offs, comments, suggestions, versioned approvals, and agent-generated drafts.

**Architecture:** Add a new `client_documents` Firestore collection with version, comment, suggestion, and approval subcollections. Keep projects, campaigns, CRM deals, reports, and SEO sprints canonical, and store links to those records on each document. Build the backend first with tests, then add a branded renderer/editor shell, adapter links, and the git-versioned agent skill.

**Tech Stack:** Next.js 16 App Router, TypeScript, Firebase Admin Firestore, Jest, existing PiB API helpers (`withAuth`, `resolveOrgScope`, `apiSuccess`, `apiError`), existing inline comment components, React 19, Tailwind-style PiB CSS tokens.

---

## File Map

Create:

- `lib/client-documents/types.ts` — public TypeScript model for documents, versions, blocks, comments, suggestions, approvals, templates, and linked records.
- `lib/client-documents/templates.ts` — template registry, default permissions, default blocks, and template lookup helpers.
- `lib/client-documents/store.ts` — Firestore-facing service layer used by API routes.
- `lib/client-documents/public.ts` — public/share sanitizers.
- `components/client-documents/DocumentRenderer.tsx` — branded read-only renderer for published versions.
- `components/client-documents/DocumentEditorShell.tsx` — internal editor shell for draft review, assumptions, and block list.
- `components/client-documents/DocumentReviewRail.tsx` — comments, assumptions, version status, publish/approve actions.
- `components/client-documents/DocumentIndex.tsx` — admin/portal listing surface.
- `components/client-documents/index.ts` — component exports.
- `app/api/v1/client-documents/route.ts` — list/create.
- `app/api/v1/client-documents/[id]/route.ts` — get/patch/archive-compatible update.
- `app/api/v1/client-documents/[id]/publish/route.ts` — publish current draft version to client review.
- `app/api/v1/client-documents/[id]/archive/route.ts` — soft archive.
- `app/api/v1/client-documents/[id]/versions/route.ts` — list/create versions.
- `app/api/v1/client-documents/[id]/versions/[versionId]/route.ts` — get one version.
- `app/api/v1/client-documents/[id]/comments/route.ts` — list/create comments.
- `app/api/v1/client-documents/[id]/comments/[commentId]/route.ts` — resolve comment.
- `app/api/v1/client-documents/[id]/suggestions/route.ts` — list/create suggestions.
- `app/api/v1/client-documents/[id]/suggestions/[suggestionId]/accept/route.ts` — accept suggestion.
- `app/api/v1/client-documents/[id]/suggestions/[suggestionId]/reject/route.ts` — reject suggestion.
- `app/api/v1/client-documents/[id]/approve/route.ts` — operational approval.
- `app/api/v1/client-documents/[id]/accept/route.ts` — formal acceptance.
- `app/api/v1/public/client-documents/[shareToken]/route.ts` — unauthenticated public/client share view.
- `app/(admin)/admin/documents/page.tsx` — global admin document index.
- `app/(admin)/admin/documents/[id]/page.tsx` — global admin document editor/view.
- `app/(admin)/admin/org/[slug]/documents/page.tsx` — org-scoped document index.
- `app/(admin)/admin/org/[slug]/documents/[id]/page.tsx` — org-scoped document editor/view.
- `app/(portal)/portal/documents/page.tsx` — portal document index.
- `app/(portal)/portal/documents/[id]/page.tsx` — portal review page.
- `app/d/[shareToken]/page.tsx` — share-token document page.
- `__tests__/lib/client-documents/templates.test.ts` — template registry tests.
- `__tests__/lib/client-documents/public.test.ts` — public sanitizer tests.
- `__tests__/api/v1/client-documents/client-documents.test.ts` — CRUD/publish/version tests.
- `__tests__/api/v1/client-documents/collaboration.test.ts` — comments/suggestions tests.
- `__tests__/api/v1/client-documents/approvals.test.ts` — approval/acceptance tests.
- `partnersinbiz-web/.claude/skills/client-documents/SKILL.md` — agent skill for document creation/review.

Modify:

- `scripts/install-platform-skills.sh` — include `client-documents` in `PLATFORM_SKILLS`.
- `.claude/skills/content-engine/SKILL.md` — link major content runs to Content Campaign Plan documents.
- `.claude/skills/project-management/SKILL.md` — link specs/change requests/sign-offs to projects.
- `.claude/skills/client-manager/SKILL.md` — include document status in client review/handoff.
- `.claude/skills/crm-sales/SKILL.md` — create Sales Proposal documents from opportunities.
- `.claude/skills/seo-sprint-manager/SKILL.md` — create SEO Sprint Plan documents when strategy sign-off is needed.
- `.claude/skills/social-media-manager/SKILL.md` — link Social Media Strategy documents when broader sign-off is needed.

---

### Task 1: Add Client Document Types and Template Registry

**Objective:** Define the model and template defaults without touching Firestore.

**Files:**
- Create: `lib/client-documents/types.ts`
- Create: `lib/client-documents/templates.ts`
- Test: `__tests__/lib/client-documents/templates.test.ts`

- [ ] **Step 1: Write the failing template tests**

Create `__tests__/lib/client-documents/templates.test.ts`:

```ts
import {
  CLIENT_DOCUMENT_TEMPLATES,
  getClientDocumentTemplate,
  createBlocksFromTemplate,
} from '@/lib/client-documents/templates'

describe('client document templates', () => {
  it('ships the first seven approved templates', () => {
    expect(CLIENT_DOCUMENT_TEMPLATES.map(t => t.type)).toEqual([
      'sales_proposal',
      'build_spec',
      'social_strategy',
      'content_campaign_plan',
      'monthly_report',
      'launch_signoff',
      'change_request',
    ])
  })

  it('uses formal acceptance for sales proposals', () => {
    const template = getClientDocumentTemplate('sales_proposal')
    expect(template.approvalMode).toBe('formal_acceptance')
    expect(template.clientPermissions).toMatchObject({
      canComment: true,
      canSuggest: true,
      canDirectEdit: false,
      canApprove: true,
    })
    expect(template.requiredBlockTypes).toContain('investment')
    expect(template.requiredBlockTypes).toContain('terms')
    expect(template.requiredBlockTypes).toContain('approval')
  })

  it('uses operational approval for launch sign-offs', () => {
    const template = getClientDocumentTemplate('launch_signoff')
    expect(template.approvalMode).toBe('operational')
    expect(template.requiredBlockTypes).toContain('approval')
  })

  it('creates stable block ids from template defaults', () => {
    const blocks = createBlocksFromTemplate('build_spec')
    expect(blocks.map(b => b.id)).toEqual([
      'hero',
      'summary',
      'scope',
      'deliverables',
      'timeline',
      'risk',
      'approval',
    ])
    expect(blocks.every(b => b.required)).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm test -- __tests__/lib/client-documents/templates.test.ts
```

Expected: FAIL because `@/lib/client-documents/templates` does not exist.

- [ ] **Step 3: Add the types**

Create `lib/client-documents/types.ts`:

```ts
export type ClientDocumentType =
  | 'sales_proposal'
  | 'build_spec'
  | 'social_strategy'
  | 'content_campaign_plan'
  | 'monthly_report'
  | 'launch_signoff'
  | 'change_request'

export type ClientDocumentStatus =
  | 'internal_draft'
  | 'internal_review'
  | 'client_review'
  | 'changes_requested'
  | 'approved'
  | 'accepted'
  | 'archived'

export type ApprovalMode = 'none' | 'operational' | 'formal_acceptance'

export type DocumentBlockType =
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

export interface ClientDocumentLinkSet {
  projectId?: string
  campaignId?: string
  reportId?: string
  dealId?: string
  seoSprintId?: string
  socialPostIds?: string[]
  invoiceId?: string
}

export interface ClientDocumentPermissions {
  canComment: boolean
  canSuggest: boolean
  canDirectEdit: boolean
  canApprove: boolean
}

export interface DocumentAssumption {
  id: string
  text: string
  severity: 'info' | 'needs_review' | 'blocks_publish'
  status: 'open' | 'resolved'
  blockId?: string
  createdBy: string
  createdAt?: unknown
  resolvedBy?: string
  resolvedAt?: unknown
}

export interface DocumentTheme {
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

export interface DocumentBlock {
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

export interface ClientDocument {
  id: string
  orgId?: string
  title: string
  type: ClientDocumentType
  templateId: string
  status: ClientDocumentStatus
  linked: ClientDocumentLinkSet
  currentVersionId: string
  latestPublishedVersionId?: string
  approvalMode: ApprovalMode
  clientPermissions: ClientDocumentPermissions
  assumptions: DocumentAssumption[]
  shareToken: string
  shareEnabled: boolean
  createdAt?: unknown
  createdBy: string
  createdByType: 'user' | 'agent' | 'system'
  updatedAt?: unknown
  updatedBy: string
  updatedByType: 'user' | 'agent' | 'system'
  deleted: boolean
}

export interface ClientDocumentVersion {
  id: string
  documentId: string
  versionNumber: number
  status: 'draft' | 'published' | 'approved' | 'superseded'
  blocks: DocumentBlock[]
  theme: DocumentTheme
  createdAt?: unknown
  createdBy: string
  createdByType: 'user' | 'agent' | 'system'
  changeSummary?: string
}

export interface DocumentComment {
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
  createdAt?: unknown
  resolvedAt?: unknown
  resolvedBy?: string
}

export interface DocumentSuggestion {
  id: string
  documentId: string
  versionId: string
  blockId: string
  kind: 'replace_text' | 'insert_text' | 'delete_text' | 'replace_block'
  original: unknown
  proposed: unknown
  status: 'open' | 'accepted' | 'rejected'
  createdBy: string
  createdAt?: unknown
  resolvedBy?: string
  resolvedAt?: unknown
}

export interface DocumentApproval {
  id: string
  documentId: string
  versionId: string
  mode: ApprovalMode
  actorId: string
  actorName: string
  actorRole: 'admin' | 'client' | 'ai'
  companyName?: string
  typedName?: string
  checkboxText?: string
  termsSnapshot?: unknown
  investmentSnapshot?: unknown
  ip?: string
  userAgent?: string
  createdAt?: unknown
}

export interface ClientDocumentTemplate {
  id: string
  type: ClientDocumentType
  label: string
  approvalMode: ApprovalMode
  clientPermissions: ClientDocumentPermissions
  requiredBlockTypes: DocumentBlockType[]
  defaultBlocks: DocumentBlock[]
}
```

- [ ] **Step 4: Add the template registry**

Create `lib/client-documents/templates.ts`:

```ts
import type {
  ClientDocumentTemplate,
  ClientDocumentType,
  DocumentBlock,
  DocumentBlockType,
} from './types'

const baseDisplay = { motion: 'reveal' as const }

function block(type: DocumentBlockType, title: string, content: unknown = ''): DocumentBlock {
  return {
    id: type,
    type,
    title,
    content,
    required: true,
    display: baseDisplay,
  }
}

export const CLIENT_DOCUMENT_TEMPLATES: ClientDocumentTemplate[] = [
  {
    id: 'sales-proposal-v1',
    type: 'sales_proposal',
    label: 'Sales Proposal',
    approvalMode: 'formal_acceptance',
    clientPermissions: { canComment: true, canSuggest: true, canDirectEdit: false, canApprove: true },
    requiredBlockTypes: ['hero', 'problem', 'scope', 'deliverables', 'timeline', 'investment', 'terms', 'approval'],
    defaultBlocks: [
      block('hero', 'Proposal'),
      block('problem', 'What needs to change'),
      block('scope', 'Scope of work'),
      block('deliverables', 'Deliverables'),
      block('timeline', 'Timeline'),
      block('investment', 'Investment'),
      block('terms', 'Terms'),
      block('approval', 'Acceptance'),
    ],
  },
  {
    id: 'build-spec-v1',
    type: 'build_spec',
    label: 'Website/App Build Spec',
    approvalMode: 'operational',
    clientPermissions: { canComment: true, canSuggest: true, canDirectEdit: false, canApprove: true },
    requiredBlockTypes: ['hero', 'summary', 'scope', 'deliverables', 'timeline', 'risk', 'approval'],
    defaultBlocks: [
      block('hero', 'Build spec'),
      block('summary', 'Executive summary'),
      block('scope', 'Scope'),
      block('deliverables', 'Deliverables'),
      block('timeline', 'Timeline'),
      block('risk', 'Risks and assumptions'),
      block('approval', 'Sign-off'),
    ],
  },
  {
    id: 'social-strategy-v1',
    type: 'social_strategy',
    label: 'Social Media Strategy',
    approvalMode: 'operational',
    clientPermissions: { canComment: true, canSuggest: true, canDirectEdit: false, canApprove: true },
    requiredBlockTypes: ['hero', 'summary', 'problem', 'deliverables', 'timeline', 'metrics', 'approval'],
    defaultBlocks: [
      block('hero', 'Social strategy'),
      block('summary', 'Strategy summary'),
      block('problem', 'Audience and positioning'),
      block('deliverables', 'Channels and content pillars'),
      block('timeline', 'Publishing rhythm'),
      block('metrics', 'Success metrics'),
      block('approval', 'Strategy approval'),
    ],
  },
  {
    id: 'content-campaign-plan-v1',
    type: 'content_campaign_plan',
    label: 'Content Campaign Plan',
    approvalMode: 'operational',
    clientPermissions: { canComment: true, canSuggest: true, canDirectEdit: false, canApprove: true },
    requiredBlockTypes: ['hero', 'summary', 'deliverables', 'timeline', 'metrics', 'approval'],
    defaultBlocks: [
      block('hero', 'Content campaign plan'),
      block('summary', 'Campaign overview'),
      block('deliverables', 'Asset plan'),
      block('timeline', 'Calendar'),
      block('metrics', 'Measurement'),
      block('approval', 'Campaign approval'),
    ],
  },
  {
    id: 'monthly-report-v1',
    type: 'monthly_report',
    label: 'Monthly Report',
    approvalMode: 'operational',
    clientPermissions: { canComment: true, canSuggest: true, canDirectEdit: false, canApprove: true },
    requiredBlockTypes: ['hero', 'summary', 'metrics', 'callout', 'approval'],
    defaultBlocks: [
      block('hero', 'Monthly report'),
      block('summary', 'Executive summary'),
      block('metrics', 'Performance'),
      block('callout', 'Next actions'),
      block('approval', 'Acknowledgement'),
    ],
  },
  {
    id: 'launch-signoff-v1',
    type: 'launch_signoff',
    label: 'Launch Sign-off',
    approvalMode: 'operational',
    clientPermissions: { canComment: true, canSuggest: true, canDirectEdit: false, canApprove: true },
    requiredBlockTypes: ['hero', 'summary', 'scope', 'risk', 'approval'],
    defaultBlocks: [
      block('hero', 'Launch sign-off'),
      block('summary', 'What is ready'),
      block('scope', 'Launch checklist'),
      block('risk', 'Known limitations'),
      block('approval', 'Launch approval'),
    ],
  },
  {
    id: 'change-request-v1',
    type: 'change_request',
    label: 'Change Request',
    approvalMode: 'operational',
    clientPermissions: { canComment: true, canSuggest: true, canDirectEdit: true, canApprove: true },
    requiredBlockTypes: ['hero', 'summary', 'scope', 'timeline', 'investment', 'approval'],
    defaultBlocks: [
      block('hero', 'Change request'),
      block('summary', 'Requested change'),
      block('scope', 'Scope impact'),
      block('timeline', 'Timeline impact'),
      block('investment', 'Cost impact'),
      block('approval', 'Change approval'),
    ],
  },
]

export function getClientDocumentTemplate(type: ClientDocumentType): ClientDocumentTemplate {
  const template = CLIENT_DOCUMENT_TEMPLATES.find(t => t.type === type)
  if (!template) throw new Error(`Unknown client document template type: ${type}`)
  return template
}

export function createBlocksFromTemplate(type: ClientDocumentType): DocumentBlock[] {
  return getClientDocumentTemplate(type).defaultBlocks.map(block => ({
    ...block,
    display: { ...block.display },
  }))
}
```

- [ ] **Step 5: Run the template tests**

Run:

```bash
npm test -- __tests__/lib/client-documents/templates.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/client-documents/types.ts lib/client-documents/templates.ts __tests__/lib/client-documents/templates.test.ts
git commit -m "feat(client-docs): add document templates"
```

---

### Task 2: Add Store Helpers for Documents and Versions

**Objective:** Create Firestore service functions with testable behavior before API routes call them.

**Files:**
- Create: `lib/client-documents/store.ts`
- Test: extend `__tests__/lib/client-documents/templates.test.ts` or create `__tests__/lib/client-documents/store.test.ts`

- [ ] **Step 1: Write failing store tests**

Create `__tests__/lib/client-documents/store.test.ts`:

```ts
const mockAdd = jest.fn()
const mockSet = jest.fn()
const mockUpdate = jest.fn()
const mockGet = jest.fn()
const mockDoc = jest.fn()
const mockCollection = jest.fn()

jest.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: mockCollection },
}))

jest.mock('crypto', () => ({
  randomBytes: () => ({ toString: () => 'share-token-1234567890' }),
}))

beforeEach(() => {
  jest.clearAllMocks()
  const versionDoc = { id: 'version-1', set: mockSet }
  const versionsCollection = { doc: jest.fn(() => versionDoc) }
  const documentDoc = {
    id: 'doc-1',
    collection: jest.fn(() => versionsCollection),
    set: mockSet,
    get: mockGet,
    update: mockUpdate,
  }
  mockDoc.mockReturnValue(documentDoc)
  mockCollection.mockReturnValue({ doc: mockDoc, add: mockAdd })
})

describe('client document store', () => {
  it('creates document and first draft version from template', async () => {
    const { createClientDocument } = await import('@/lib/client-documents/store')
    const result = await createClientDocument({
      title: 'Proposal for Client X',
      type: 'sales_proposal',
      orgId: 'org-1',
      linked: { dealId: 'deal-1' },
      assumptions: [{ text: 'Budget needs confirmation', severity: 'blocks_publish' }],
      user: { uid: 'ai-agent', role: 'ai' },
    })

    expect(result).toEqual({ id: 'doc-1', versionId: 'version-1', shareToken: 'share-token-1234567890' })
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Proposal for Client X',
      type: 'sales_proposal',
      orgId: 'org-1',
      templateId: 'sales-proposal-v1',
      status: 'internal_draft',
      currentVersionId: 'version-1',
      approvalMode: 'formal_acceptance',
      shareEnabled: false,
      deleted: false,
    }))
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({
      documentId: 'doc-1',
      versionNumber: 1,
      status: 'draft',
      blocks: expect.any(Array),
    }))
  })

  it('blocks publish when orgId is missing', async () => {
    mockGet.mockResolvedValue({
      exists: true,
      data: () => ({ status: 'internal_draft', currentVersionId: 'version-1', shareEnabled: false }),
    })
    const { publishClientDocument } = await import('@/lib/client-documents/store')
    await expect(publishClientDocument('doc-1', { uid: 'u1', role: 'admin' }))
      .rejects.toThrow('orgId is required before publishing')
  })
})
```

- [ ] **Step 2: Run the store tests to verify failure**

Run:

```bash
npm test -- __tests__/lib/client-documents/store.test.ts
```

Expected: FAIL because `store.ts` does not exist.

- [ ] **Step 3: Implement store helpers**

Create `lib/client-documents/store.ts`:

```ts
import { randomBytes } from 'crypto'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import type { ApiUser } from '@/lib/api/types'
import { createBlocksFromTemplate, getClientDocumentTemplate } from './templates'
import type {
  ClientDocument,
  ClientDocumentLinkSet,
  ClientDocumentType,
  DocumentAssumption,
  DocumentTheme,
} from './types'

export const CLIENT_DOCUMENTS_COLLECTION = 'client_documents'

const DEFAULT_THEME: DocumentTheme = {
  palette: { bg: '#0A0A0B', text: '#F7F4EE', accent: '#F5A623', muted: '#A3A3A3' },
  typography: { heading: 'Instrument Serif', body: 'Geist' },
}

function actorType(user: ApiUser): 'user' | 'agent' | 'system' {
  return user.role === 'ai' ? 'agent' : 'user'
}

function normalizeAssumptions(
  assumptions: Array<{ text: string; severity?: DocumentAssumption['severity']; blockId?: string }> | undefined,
  user: ApiUser,
): DocumentAssumption[] {
  return (assumptions ?? [])
    .filter(a => typeof a.text === 'string' && a.text.trim().length > 0)
    .map((a, index) => ({
      id: `assumption-${index + 1}`,
      text: a.text.trim(),
      severity: a.severity ?? 'needs_review',
      status: 'open',
      blockId: a.blockId,
      createdBy: user.uid,
      createdAt: FieldValue.serverTimestamp(),
    }))
}

export async function createClientDocument(input: {
  title: string
  type: ClientDocumentType
  orgId?: string
  linked?: ClientDocumentLinkSet
  assumptions?: Array<{ text: string; severity?: DocumentAssumption['severity']; blockId?: string }>
  user: ApiUser
}): Promise<{ id: string; versionId: string; shareToken: string }> {
  const title = input.title.trim()
  if (!title) throw new Error('title is required')
  const template = getClientDocumentTemplate(input.type)
  const ref = adminDb.collection(CLIENT_DOCUMENTS_COLLECTION).doc()
  const versionRef = ref.collection('versions').doc()
  const shareToken = randomBytes(12).toString('hex')

  const document: Omit<ClientDocument, 'id'> = {
    orgId: input.orgId,
    title,
    type: input.type,
    templateId: template.id,
    status: 'internal_draft',
    linked: input.linked ?? {},
    currentVersionId: versionRef.id,
    approvalMode: template.approvalMode,
    clientPermissions: template.clientPermissions,
    assumptions: normalizeAssumptions(input.assumptions, input.user),
    shareToken,
    shareEnabled: false,
    createdAt: FieldValue.serverTimestamp(),
    createdBy: input.user.uid,
    createdByType: actorType(input.user),
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: input.user.uid,
    updatedByType: actorType(input.user),
    deleted: false,
  }

  await ref.set(document)
  await versionRef.set({
    documentId: ref.id,
    versionNumber: 1,
    status: 'draft',
    blocks: createBlocksFromTemplate(input.type),
    theme: DEFAULT_THEME,
    createdAt: FieldValue.serverTimestamp(),
    createdBy: input.user.uid,
    createdByType: actorType(input.user),
    changeSummary: 'Initial draft',
  })

  return { id: ref.id, versionId: versionRef.id, shareToken }
}

export async function getClientDocument(id: string): Promise<(ClientDocument & { id: string }) | null> {
  const snap = await adminDb.collection(CLIENT_DOCUMENTS_COLLECTION).doc(id).get()
  if (!snap.exists || snap.data()?.deleted === true) return null
  return { id: snap.id, ...snap.data() } as ClientDocument & { id: string }
}

export async function publishClientDocument(id: string, user: ApiUser): Promise<{ id: string; versionId: string }> {
  const ref = adminDb.collection(CLIENT_DOCUMENTS_COLLECTION).doc(id)
  const snap = await ref.get()
  if (!snap.exists || snap.data()?.deleted === true) throw new Error('Document not found')
  const data = snap.data() as ClientDocument
  if (!data.orgId) throw new Error('orgId is required before publishing')
  const blockers = (data.assumptions ?? []).filter(a => a.status === 'open' && a.severity === 'blocks_publish')
  if (blockers.length > 0) throw new Error('Resolve blocking assumptions before publishing')
  await ref.update({
    status: 'client_review',
    latestPublishedVersionId: data.currentVersionId,
    shareEnabled: true,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: user.uid,
    updatedByType: actorType(user),
  })
  await ref.collection('versions').doc(data.currentVersionId).update({ status: 'published' })
  return { id, versionId: data.currentVersionId }
}
```

- [ ] **Step 4: Run store tests**

Run:

```bash
npm test -- __tests__/lib/client-documents/store.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/client-documents/store.ts __tests__/lib/client-documents/store.test.ts
git commit -m "feat(client-docs): add document store"
```

---

### Task 3: Add List, Create, Get, Patch, Publish, and Archive APIs

**Objective:** Expose the foundation through authenticated API routes.

**Files:**
- Create: `app/api/v1/client-documents/route.ts`
- Create: `app/api/v1/client-documents/[id]/route.ts`
- Create: `app/api/v1/client-documents/[id]/publish/route.ts`
- Create: `app/api/v1/client-documents/[id]/archive/route.ts`
- Test: `__tests__/api/v1/client-documents/client-documents.test.ts`

- [ ] **Step 1: Write failing API tests**

Create `__tests__/api/v1/client-documents/client-documents.test.ts`:

```ts
import { NextRequest } from 'next/server'

const mockAdd = jest.fn()
const mockSet = jest.fn()
const mockGet = jest.fn()
const mockUpdate = jest.fn()
const mockDoc = jest.fn()
const mockWhere = jest.fn()
const mockLimit = jest.fn()

jest.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: jest.fn(() => ({
      doc: mockDoc,
      where: mockWhere,
      limit: mockLimit,
      get: mockGet,
      add: mockAdd,
    })),
  },
}))

jest.mock('@/lib/api/auth', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withAuth: (_role: string, handler: any) => handler,
}))

beforeEach(() => {
  jest.clearAllMocks()
  const versionDoc = { id: 'version-1', set: mockSet, update: mockUpdate, get: mockGet }
  const versions = { doc: jest.fn(() => versionDoc), get: mockGet }
  const doc = { id: 'doc-1', set: mockSet, update: mockUpdate, get: mockGet, collection: jest.fn(() => versions) }
  const query = { where: mockWhere, limit: mockLimit, get: mockGet }
  mockDoc.mockReturnValue(doc)
  mockWhere.mockReturnValue(query)
  mockLimit.mockReturnValue(query)
})

const user = { uid: 'ai-agent', role: 'ai' as const }

describe('client documents API', () => {
  it('creates a client document', async () => {
    const { POST } = await import('@/app/api/v1/client-documents/route')
    const req = new NextRequest('http://localhost/api/v1/client-documents', {
      method: 'POST',
      body: JSON.stringify({
        orgId: 'org-1',
        title: 'Proposal',
        type: 'sales_proposal',
        linked: { dealId: 'deal-1' },
      }),
    })
    const res = await POST(req, user)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.data).toMatchObject({ id: 'doc-1', versionId: 'version-1' })
  })

  it('lists org-scoped documents', async () => {
    mockGet.mockResolvedValueOnce({
      docs: [{ id: 'doc-1', data: () => ({ orgId: 'org-1', title: 'Proposal', deleted: false }) }],
    })
    const { GET } = await import('@/app/api/v1/client-documents/route')
    const req = new NextRequest('http://localhost/api/v1/client-documents?orgId=org-1')
    const res = await GET(req, user)
    expect(res.status).toBe(200)
    expect(mockWhere).toHaveBeenCalledWith('orgId', '==', 'org-1')
  })

  it('publishes only documents with orgId and no blocking assumptions', async () => {
    mockGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({
        orgId: 'org-1',
        currentVersionId: 'version-1',
        assumptions: [],
        deleted: false,
      }),
    })
    const { POST } = await import('@/app/api/v1/client-documents/[id]/publish/route')
    const req = new NextRequest('http://localhost/api/v1/client-documents/doc-1/publish', { method: 'POST' })
    const res = await POST(req, user, { params: Promise.resolve({ id: 'doc-1' }) })
    expect(res.status).toBe(200)
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      status: 'client_review',
      latestPublishedVersionId: 'version-1',
      shareEnabled: true,
    }))
  })
})
```

- [ ] **Step 2: Run API tests to verify failure**

Run:

```bash
npm test -- __tests__/api/v1/client-documents/client-documents.test.ts
```

Expected: FAIL because the API route files do not exist.

- [ ] **Step 3: Implement list/create route**

Create `app/api/v1/client-documents/route.ts`:

```ts
import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { resolveOrgScope } from '@/lib/api/orgScope'
import { apiSuccess, apiError } from '@/lib/api/response'
import type { ApiUser } from '@/lib/api/types'
import { CLIENT_DOCUMENTS_COLLECTION, createClientDocument } from '@/lib/client-documents/store'
import type { ClientDocumentType } from '@/lib/client-documents/types'

export const dynamic = 'force-dynamic'

const VALID_TYPES: ClientDocumentType[] = [
  'sales_proposal',
  'build_spec',
  'social_strategy',
  'content_campaign_plan',
  'monthly_report',
  'launch_signoff',
  'change_request',
]

export const GET = withAuth('client', async (req: NextRequest, user: ApiUser) => {
  const { searchParams } = new URL(req.url)
  const scope = resolveOrgScope(user, searchParams.get('orgId'))
  if (!scope.ok) return apiError(scope.error, scope.status)
  const status = searchParams.get('status')
  const type = searchParams.get('type')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = adminDb.collection(CLIENT_DOCUMENTS_COLLECTION).where('orgId', '==', scope.orgId)
  if (status) query = query.where('status', '==', status)
  if (type && VALID_TYPES.includes(type as ClientDocumentType)) query = query.where('type', '==', type)

  const snap = await query.get()
  const docs = snap.docs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((d: any) => ({ id: d.id, ...d.data() }))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((d: any) => d.deleted !== true)
  return apiSuccess(docs)
})

export const POST = withAuth('client', async (req: NextRequest, user: ApiUser) => {
  const body = await req.json().catch(() => null)
  if (!body) return apiError('Invalid JSON', 400)
  if (typeof body.title !== 'string' || !body.title.trim()) return apiError('title is required', 400)
  if (!VALID_TYPES.includes(body.type)) return apiError(`type must be one of: ${VALID_TYPES.join(', ')}`, 400)

  let orgId: string | undefined
  if (body.orgId !== undefined) {
    const scope = resolveOrgScope(user, typeof body.orgId === 'string' ? body.orgId.trim() : null)
    if (!scope.ok) return apiError(scope.error, scope.status)
    orgId = scope.orgId
  }

  const created = await createClientDocument({
    title: body.title,
    type: body.type,
    orgId,
    linked: body.linked && typeof body.linked === 'object' ? body.linked : {},
    assumptions: Array.isArray(body.assumptions) ? body.assumptions : [],
    user,
  })

  return apiSuccess(created, 201)
})
```

- [ ] **Step 4: Implement get/patch route**

Create `app/api/v1/client-documents/[id]/route.ts`:

```ts
import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { resolveOrgScope } from '@/lib/api/orgScope'
import { apiSuccess, apiError } from '@/lib/api/response'
import type { ApiUser } from '@/lib/api/types'
import { CLIENT_DOCUMENTS_COLLECTION, getClientDocument } from '@/lib/client-documents/store'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

async function assertAccess(id: string, user: ApiUser) {
  const doc = await getClientDocument(id)
  if (!doc) return { ok: false as const, response: apiError('Document not found', 404) }
  if (doc.orgId) {
    const scope = resolveOrgScope(user, doc.orgId)
    if (!scope.ok) return { ok: false as const, response: apiError(scope.error, scope.status) }
  }
  return { ok: true as const, doc }
}

export const GET = withAuth('client', async (_req: NextRequest, user: ApiUser, ctx: RouteContext) => {
  const { id } = await ctx.params
  const access = await assertAccess(id, user)
  if (!access.ok) return access.response
  return apiSuccess(access.doc)
})

export const PATCH = withAuth('client', async (req: NextRequest, user: ApiUser, ctx: RouteContext) => {
  const { id } = await ctx.params
  const access = await assertAccess(id, user)
  if (!access.ok) return access.response
  const body = await req.json().catch(() => null)
  if (!body) return apiError('Invalid JSON', 400)

  const update: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: user.uid,
    updatedByType: user.role === 'ai' ? 'agent' : 'user',
  }
  if (typeof body.title === 'string') {
    if (!body.title.trim()) return apiError('title cannot be empty', 400)
    update.title = body.title.trim()
  }
  if (body.linked && typeof body.linked === 'object') update.linked = body.linked
  if (Array.isArray(body.assumptions)) update.assumptions = body.assumptions
  if (typeof body.shareEnabled === 'boolean') update.shareEnabled = body.shareEnabled

  await adminDb.collection(CLIENT_DOCUMENTS_COLLECTION).doc(id).update(update)
  return apiSuccess({ id, updated: Object.keys(update) })
})
```

- [ ] **Step 5: Implement publish and archive routes**

Create `app/api/v1/client-documents/[id]/publish/route.ts`:

```ts
import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import type { ApiUser } from '@/lib/api/types'
import { publishClientDocument } from '@/lib/client-documents/store'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

export const POST = withAuth('client', async (_req: NextRequest, user: ApiUser, ctx: RouteContext) => {
  const { id } = await ctx.params
  try {
    return apiSuccess(await publishClientDocument(id, user))
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Unable to publish document', 400)
  }
})
```

Create `app/api/v1/client-documents/[id]/archive/route.ts`:

```ts
import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import type { ApiUser } from '@/lib/api/types'
import { CLIENT_DOCUMENTS_COLLECTION, getClientDocument } from '@/lib/client-documents/store'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

export const POST = withAuth('client', async (_req: NextRequest, user: ApiUser, ctx: RouteContext) => {
  const { id } = await ctx.params
  const doc = await getClientDocument(id)
  if (!doc) return apiError('Document not found', 404)
  await adminDb.collection(CLIENT_DOCUMENTS_COLLECTION).doc(id).update({
    status: 'archived',
    deleted: true,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: user.uid,
    updatedByType: user.role === 'ai' ? 'agent' : 'user',
  })
  return apiSuccess({ id })
})
```

- [ ] **Step 6: Run API tests**

Run:

```bash
npm test -- __tests__/api/v1/client-documents/client-documents.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/api/v1/client-documents lib/client-documents/store.ts __tests__/api/v1/client-documents/client-documents.test.ts
git commit -m "feat(client-docs): add document API"
```

---

### Task 4: Add Version Routes

**Objective:** Allow API consumers to list, create, and fetch document versions.

**Files:**
- Create: `app/api/v1/client-documents/[id]/versions/route.ts`
- Create: `app/api/v1/client-documents/[id]/versions/[versionId]/route.ts`
- Test: extend `__tests__/api/v1/client-documents/client-documents.test.ts`

- [ ] **Step 1: Add failing version tests**

Append to `__tests__/api/v1/client-documents/client-documents.test.ts`:

```ts
it('lists document versions', async () => {
  mockGet.mockResolvedValueOnce({
    exists: true,
    data: () => ({ orgId: 'org-1', deleted: false }),
  })
  mockGet.mockResolvedValueOnce({
    docs: [{ id: 'version-1', data: () => ({ versionNumber: 1, status: 'draft' }) }],
  })
  const { GET } = await import('@/app/api/v1/client-documents/[id]/versions/route')
  const req = new NextRequest('http://localhost/api/v1/client-documents/doc-1/versions')
  const res = await GET(req, user, { params: Promise.resolve({ id: 'doc-1' }) })
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body.data).toEqual([{ id: 'version-1', versionNumber: 1, status: 'draft' }])
})
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm test -- __tests__/api/v1/client-documents/client-documents.test.ts
```

Expected: FAIL because version routes do not exist.

- [ ] **Step 3: Implement version routes**

Create `app/api/v1/client-documents/[id]/versions/route.ts`:

```ts
import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import type { ApiUser } from '@/lib/api/types'
import { CLIENT_DOCUMENTS_COLLECTION, getClientDocument } from '@/lib/client-documents/store'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

export const GET = withAuth('client', async (_req: NextRequest, _user: ApiUser, ctx: RouteContext) => {
  const { id } = await ctx.params
  const doc = await getClientDocument(id)
  if (!doc) return apiError('Document not found', 404)
  const snap = await adminDb.collection(CLIENT_DOCUMENTS_COLLECTION).doc(id).collection('versions').get()
  const versions = snap.docs.map(d => ({ id: d.id, ...d.data() }))
  return apiSuccess(versions)
})

export const POST = withAuth('client', async (req: NextRequest, user: ApiUser, ctx: RouteContext) => {
  const { id } = await ctx.params
  const doc = await getClientDocument(id)
  if (!doc) return apiError('Document not found', 404)
  const body = await req.json().catch(() => null)
  if (!body || !Array.isArray(body.blocks)) return apiError('blocks array is required', 400)
  const ref = adminDb.collection(CLIENT_DOCUMENTS_COLLECTION).doc(id).collection('versions').doc()
  const versionNumber = typeof body.versionNumber === 'number' ? body.versionNumber : Date.now()
  await ref.set({
    documentId: id,
    versionNumber,
    status: 'draft',
    blocks: body.blocks,
    theme: body.theme ?? {},
    createdAt: FieldValue.serverTimestamp(),
    createdBy: user.uid,
    createdByType: user.role === 'ai' ? 'agent' : 'user',
    changeSummary: typeof body.changeSummary === 'string' ? body.changeSummary : 'Draft update',
  })
  await adminDb.collection(CLIENT_DOCUMENTS_COLLECTION).doc(id).update({
    currentVersionId: ref.id,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: user.uid,
    updatedByType: user.role === 'ai' ? 'agent' : 'user',
  })
  return apiSuccess({ id: ref.id }, 201)
})
```

Create `app/api/v1/client-documents/[id]/versions/[versionId]/route.ts`:

```ts
import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { CLIENT_DOCUMENTS_COLLECTION, getClientDocument } from '@/lib/client-documents/store'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string; versionId: string }> }

export const GET = withAuth('client', async (_req: NextRequest, _user, ctx: RouteContext) => {
  const { id, versionId } = await ctx.params
  const doc = await getClientDocument(id)
  if (!doc) return apiError('Document not found', 404)
  const snap = await adminDb.collection(CLIENT_DOCUMENTS_COLLECTION).doc(id).collection('versions').doc(versionId).get()
  if (!snap.exists) return apiError('Version not found', 404)
  return apiSuccess({ id: snap.id, ...snap.data() })
})
```

- [ ] **Step 4: Run tests**

Run:

```bash
npm test -- __tests__/api/v1/client-documents/client-documents.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/v1/client-documents/[id]/versions __tests__/api/v1/client-documents/client-documents.test.ts
git commit -m "feat(client-docs): add document versions API"
```

---

### Task 5: Add Comments and Suggestions APIs

**Objective:** Support inline feedback, open/resolved comments, and accept/reject suggestions.

**Files:**
- Create: `app/api/v1/client-documents/[id]/comments/route.ts`
- Create: `app/api/v1/client-documents/[id]/comments/[commentId]/route.ts`
- Create: `app/api/v1/client-documents/[id]/suggestions/route.ts`
- Create: `app/api/v1/client-documents/[id]/suggestions/[suggestionId]/accept/route.ts`
- Create: `app/api/v1/client-documents/[id]/suggestions/[suggestionId]/reject/route.ts`
- Test: `__tests__/api/v1/client-documents/collaboration.test.ts`

- [ ] **Step 1: Write failing collaboration tests**

Create `__tests__/api/v1/client-documents/collaboration.test.ts`:

```ts
import { NextRequest } from 'next/server'

const mockSet = jest.fn()
const mockGet = jest.fn()
const mockUpdate = jest.fn()
const mockDoc = jest.fn()
const mockCollection = jest.fn()

jest.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: mockCollection },
}))

jest.mock('@/lib/api/auth', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withAuth: (_role: string, handler: any) => handler,
}))

const user = { uid: 'client-1', role: 'client' as const, orgId: 'org-1' }

beforeEach(() => {
  jest.clearAllMocks()
  const childDoc = { id: 'child-1', set: mockSet, get: mockGet, update: mockUpdate }
  const childCollection = { doc: jest.fn(() => childDoc), get: mockGet }
  const documentDoc = {
    id: 'doc-1',
    get: mockGet,
    update: mockUpdate,
    collection: jest.fn(() => childCollection),
  }
  mockDoc.mockReturnValue(documentDoc)
  mockCollection.mockReturnValue({ doc: mockDoc })
})

describe('client document collaboration', () => {
  it('creates an anchored comment on the current version', async () => {
    mockGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ orgId: 'org-1', currentVersionId: 'version-1', deleted: false }),
    })
    const { POST } = await import('@/app/api/v1/client-documents/[id]/comments/route')
    const req = new NextRequest('http://localhost/api/v1/client-documents/doc-1/comments', {
      method: 'POST',
      body: JSON.stringify({
        text: 'Please soften this.',
        blockId: 'summary',
        anchor: { type: 'text', text: 'This is too hard sell' },
      }),
    })
    const res = await POST(req, user, { params: Promise.resolve({ id: 'doc-1' }) })
    expect(res.status).toBe(201)
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({
      documentId: 'doc-1',
      versionId: 'version-1',
      blockId: 'summary',
      text: 'Please soften this.',
      status: 'open',
      agentPickedUp: false,
    }))
  })

  it('rejects direct suggestion acceptance from clients', async () => {
    const { POST } = await import('@/app/api/v1/client-documents/[id]/suggestions/[suggestionId]/accept/route')
    const req = new NextRequest('http://localhost/api/v1/client-documents/doc-1/suggestions/s1/accept', { method: 'POST' })
    const res = await POST(req, user, { params: Promise.resolve({ id: 'doc-1', suggestionId: 's1' }) })
    expect(res.status).toBe(403)
  })
})
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm test -- __tests__/api/v1/client-documents/collaboration.test.ts
```

Expected: FAIL because collaboration routes do not exist.

- [ ] **Step 3: Implement comments routes**

Create `app/api/v1/client-documents/[id]/comments/route.ts`:

```ts
import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import type { ApiUser } from '@/lib/api/types'
import { CLIENT_DOCUMENTS_COLLECTION, getClientDocument } from '@/lib/client-documents/store'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

export const GET = withAuth('client', async (_req: NextRequest, _user: ApiUser, ctx: RouteContext) => {
  const { id } = await ctx.params
  const doc = await getClientDocument(id)
  if (!doc) return apiError('Document not found', 404)
  const snap = await adminDb.collection(CLIENT_DOCUMENTS_COLLECTION).doc(id).collection('comments').get()
  return apiSuccess(snap.docs.map(d => ({ id: d.id, ...d.data() })))
})

export const POST = withAuth('client', async (req: NextRequest, user: ApiUser, ctx: RouteContext) => {
  const { id } = await ctx.params
  const doc = await getClientDocument(id)
  if (!doc) return apiError('Document not found', 404)
  const body = await req.json().catch(() => null)
  if (!body || typeof body.text !== 'string' || !body.text.trim()) return apiError('text is required', 400)
  const ref = adminDb.collection(CLIENT_DOCUMENTS_COLLECTION).doc(id).collection('comments').doc()
  await ref.set({
    documentId: id,
    versionId: body.versionId ?? doc.currentVersionId,
    blockId: typeof body.blockId === 'string' ? body.blockId : null,
    text: body.text.trim(),
    anchor: body.anchor ?? null,
    userId: user.uid,
    userName: body.userName ?? user.uid,
    userRole: user.role === 'ai' ? 'agent' : user.role,
    status: 'open',
    agentPickedUp: false,
    createdAt: FieldValue.serverTimestamp(),
  })
  return apiSuccess({ id: ref.id }, 201)
})
```

Create `app/api/v1/client-documents/[id]/comments/[commentId]/route.ts`:

```ts
import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import type { ApiUser } from '@/lib/api/types'
import { CLIENT_DOCUMENTS_COLLECTION, getClientDocument } from '@/lib/client-documents/store'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string; commentId: string }> }

export const PATCH = withAuth('client', async (req: NextRequest, user: ApiUser, ctx: RouteContext) => {
  const { id, commentId } = await ctx.params
  const doc = await getClientDocument(id)
  if (!doc) return apiError('Document not found', 404)
  const body = await req.json().catch(() => null)
  const status = body?.status === 'resolved' ? 'resolved' : 'open'
  await adminDb.collection(CLIENT_DOCUMENTS_COLLECTION).doc(id).collection('comments').doc(commentId).update({
    status,
    resolvedAt: status === 'resolved' ? FieldValue.serverTimestamp() : null,
    resolvedBy: status === 'resolved' ? user.uid : null,
  })
  return apiSuccess({ id: commentId, status })
})
```

- [ ] **Step 4: Implement suggestions routes**

Create `app/api/v1/client-documents/[id]/suggestions/route.ts`:

```ts
import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import type { ApiUser } from '@/lib/api/types'
import { CLIENT_DOCUMENTS_COLLECTION, getClientDocument } from '@/lib/client-documents/store'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }
const VALID_KINDS = ['replace_text', 'insert_text', 'delete_text', 'replace_block']

export const GET = withAuth('client', async (_req: NextRequest, _user: ApiUser, ctx: RouteContext) => {
  const { id } = await ctx.params
  const doc = await getClientDocument(id)
  if (!doc) return apiError('Document not found', 404)
  const snap = await adminDb.collection(CLIENT_DOCUMENTS_COLLECTION).doc(id).collection('suggestions').get()
  return apiSuccess(snap.docs.map(d => ({ id: d.id, ...d.data() })))
})

export const POST = withAuth('client', async (req: NextRequest, user: ApiUser, ctx: RouteContext) => {
  const { id } = await ctx.params
  const doc = await getClientDocument(id)
  if (!doc) return apiError('Document not found', 404)
  const body = await req.json().catch(() => null)
  if (!body) return apiError('Invalid JSON', 400)
  if (typeof body.blockId !== 'string' || !body.blockId.trim()) return apiError('blockId is required', 400)
  if (!VALID_KINDS.includes(body.kind)) return apiError(`kind must be one of: ${VALID_KINDS.join(', ')}`, 400)
  if (body.proposed === undefined) return apiError('proposed is required', 400)
  const ref = adminDb.collection(CLIENT_DOCUMENTS_COLLECTION).doc(id).collection('suggestions').doc()
  await ref.set({
    documentId: id,
    versionId: body.versionId ?? doc.currentVersionId,
    blockId: body.blockId.trim(),
    kind: body.kind,
    original: body.original ?? null,
    proposed: body.proposed,
    status: 'open',
    createdBy: user.uid,
    createdAt: FieldValue.serverTimestamp(),
  })
  return apiSuccess({ id: ref.id }, 201)
})
```

Create `app/api/v1/client-documents/[id]/suggestions/[suggestionId]/accept/route.ts`:

```ts
import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import type { ApiUser } from '@/lib/api/types'
import { CLIENT_DOCUMENTS_COLLECTION, getClientDocument } from '@/lib/client-documents/store'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string; suggestionId: string }> }

export const POST = withAuth('client', async (_req: NextRequest, user: ApiUser, ctx: RouteContext) => {
  if (user.role === 'client') return apiError('Only internal users can resolve suggestions', 403)
  const { id, suggestionId } = await ctx.params
  const doc = await getClientDocument(id)
  if (!doc) return apiError('Document not found', 404)
  await adminDb.collection(CLIENT_DOCUMENTS_COLLECTION).doc(id).collection('suggestions').doc(suggestionId).update({
    status: 'accepted',
    resolvedBy: user.uid,
    resolvedAt: FieldValue.serverTimestamp(),
  })
  return apiSuccess({ id: suggestionId, status: 'accepted' })
})
```

Create `app/api/v1/client-documents/[id]/suggestions/[suggestionId]/reject/route.ts`:

```ts
import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import type { ApiUser } from '@/lib/api/types'
import { CLIENT_DOCUMENTS_COLLECTION, getClientDocument } from '@/lib/client-documents/store'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string; suggestionId: string }> }

export const POST = withAuth('client', async (_req: NextRequest, user: ApiUser, ctx: RouteContext) => {
  if (user.role === 'client') return apiError('Only internal users can resolve suggestions', 403)
  const { id, suggestionId } = await ctx.params
  const doc = await getClientDocument(id)
  if (!doc) return apiError('Document not found', 404)
  await adminDb.collection(CLIENT_DOCUMENTS_COLLECTION).doc(id).collection('suggestions').doc(suggestionId).update({
    status: 'rejected',
    resolvedBy: user.uid,
    resolvedAt: FieldValue.serverTimestamp(),
  })
  return apiSuccess({ id: suggestionId, status: 'rejected' })
})
```

Do not mutate version blocks in this task; accepted suggestions become resolved records first, and the editor applies them in Task 8.

- [ ] **Step 5: Run collaboration tests**

Run:

```bash
npm test -- __tests__/api/v1/client-documents/collaboration.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/api/v1/client-documents/[id]/comments app/api/v1/client-documents/[id]/suggestions __tests__/api/v1/client-documents/collaboration.test.ts
git commit -m "feat(client-docs): add document collaboration API"
```

---

### Task 6: Add Operational Approval and Formal Acceptance

**Objective:** Record approvals against immutable published versions.

**Files:**
- Create: `app/api/v1/client-documents/[id]/approve/route.ts`
- Create: `app/api/v1/client-documents/[id]/accept/route.ts`
- Test: `__tests__/api/v1/client-documents/approvals.test.ts`

- [ ] **Step 1: Write failing approval tests**

Create `__tests__/api/v1/client-documents/approvals.test.ts`:

```ts
import { NextRequest } from 'next/server'

const mockSet = jest.fn()
const mockGet = jest.fn()
const mockUpdate = jest.fn()
const mockDoc = jest.fn()
const mockCollection = jest.fn()

jest.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: mockCollection },
}))

jest.mock('@/lib/api/auth', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withAuth: (_role: string, handler: any) => handler,
}))

beforeEach(() => {
  jest.clearAllMocks()
  const childDoc = { id: 'approval-1', set: mockSet, update: mockUpdate, get: mockGet }
  const childCollection = { doc: jest.fn(() => childDoc) }
  const documentDoc = {
    id: 'doc-1',
    get: mockGet,
    update: mockUpdate,
    collection: jest.fn(() => childCollection),
  }
  mockDoc.mockReturnValue(documentDoc)
  mockCollection.mockReturnValue({ doc: mockDoc })
})

const client = { uid: 'client-1', role: 'client' as const, orgId: 'org-1' }

describe('client document approvals', () => {
  it('records operational approval against latest published version', async () => {
    mockGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({
        orgId: 'org-1',
        approvalMode: 'operational',
        latestPublishedVersionId: 'version-1',
        deleted: false,
      }),
    })
    const { POST } = await import('@/app/api/v1/client-documents/[id]/approve/route')
    const req = new NextRequest('http://localhost/api/v1/client-documents/doc-1/approve', {
      method: 'POST',
      headers: { 'user-agent': 'jest' },
      body: JSON.stringify({ actorName: 'Client Owner', companyName: 'Client Co' }),
    })
    const res = await POST(req, client, { params: Promise.resolve({ id: 'doc-1' }) })
    expect(res.status).toBe(200)
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({
      documentId: 'doc-1',
      versionId: 'version-1',
      mode: 'operational',
      actorId: 'client-1',
      actorName: 'Client Owner',
      companyName: 'Client Co',
      userAgent: 'jest',
    }))
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'approved' }))
  })

  it('requires typed name for formal acceptance', async () => {
    mockGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({
        orgId: 'org-1',
        approvalMode: 'formal_acceptance',
        latestPublishedVersionId: 'version-1',
        deleted: false,
      }),
    })
    const { POST } = await import('@/app/api/v1/client-documents/[id]/accept/route')
    const req = new NextRequest('http://localhost/api/v1/client-documents/doc-1/accept', {
      method: 'POST',
      body: JSON.stringify({ checkboxText: 'I accept this proposal.' }),
    })
    const res = await POST(req, client, { params: Promise.resolve({ id: 'doc-1' }) })
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm test -- __tests__/api/v1/client-documents/approvals.test.ts
```

Expected: FAIL because approval routes do not exist.

- [ ] **Step 3: Implement approval routes**

Create `app/api/v1/client-documents/[id]/approve/route.ts`:

```ts
import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import type { ApiUser } from '@/lib/api/types'
import { CLIENT_DOCUMENTS_COLLECTION, getClientDocument } from '@/lib/client-documents/store'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

export const POST = withAuth('client', async (req: NextRequest, user: ApiUser, ctx: RouteContext) => {
  const { id } = await ctx.params
  const doc = await getClientDocument(id)
  if (!doc) return apiError('Document not found', 404)
  if (doc.approvalMode !== 'operational') return apiError('Document does not use operational approval', 400)
  if (!doc.latestPublishedVersionId) return apiError('Publish a version before approval', 400)
  const body = await req.json().catch(() => ({}))
  const ref = adminDb.collection(CLIENT_DOCUMENTS_COLLECTION).doc(id).collection('approvals').doc()
  await ref.set({
    documentId: id,
    versionId: doc.latestPublishedVersionId,
    mode: 'operational',
    actorId: user.uid,
    actorName: typeof body.actorName === 'string' && body.actorName.trim() ? body.actorName.trim() : user.uid,
    actorRole: user.role === 'ai' ? 'ai' : user.role,
    companyName: typeof body.companyName === 'string' ? body.companyName.trim() : '',
    ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '',
    userAgent: req.headers.get('user-agent') ?? '',
    createdAt: FieldValue.serverTimestamp(),
  })
  await adminDb.collection(CLIENT_DOCUMENTS_COLLECTION).doc(id).update({
    status: 'approved',
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: user.uid,
  })
  return apiSuccess({ id: ref.id, versionId: doc.latestPublishedVersionId })
})
```

Create `app/api/v1/client-documents/[id]/accept/route.ts`:

```ts
import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import type { ApiUser } from '@/lib/api/types'
import { CLIENT_DOCUMENTS_COLLECTION, getClientDocument } from '@/lib/client-documents/store'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

export const POST = withAuth('client', async (req: NextRequest, user: ApiUser, ctx: RouteContext) => {
  const { id } = await ctx.params
  const doc = await getClientDocument(id)
  if (!doc) return apiError('Document not found', 404)
  if (doc.approvalMode !== 'formal_acceptance') return apiError('Document does not use formal acceptance', 400)
  if (!doc.latestPublishedVersionId) return apiError('Publish a version before acceptance', 400)
  const body = await req.json().catch(() => ({}))
  const typedName = typeof body.typedName === 'string' ? body.typedName.trim() : ''
  const checkboxText = typeof body.checkboxText === 'string' ? body.checkboxText.trim() : ''
  if (!typedName) return apiError('typedName is required', 400)
  if (!checkboxText) return apiError('checkboxText is required', 400)

  const ref = adminDb.collection(CLIENT_DOCUMENTS_COLLECTION).doc(id).collection('approvals').doc()
  await ref.set({
    documentId: id,
    versionId: doc.latestPublishedVersionId,
    mode: 'formal_acceptance',
    actorId: user.uid,
    actorName: typeof body.actorName === 'string' && body.actorName.trim() ? body.actorName.trim() : user.uid,
    actorRole: user.role === 'ai' ? 'ai' : user.role,
    companyName: typeof body.companyName === 'string' ? body.companyName.trim() : '',
    typedName,
    checkboxText,
    termsSnapshot: body.termsSnapshot ?? null,
    investmentSnapshot: body.investmentSnapshot ?? null,
    ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '',
    userAgent: req.headers.get('user-agent') ?? '',
    createdAt: FieldValue.serverTimestamp(),
  })
  await adminDb.collection(CLIENT_DOCUMENTS_COLLECTION).doc(id).update({
    status: 'accepted',
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: user.uid,
  })
  return apiSuccess({ id: ref.id, versionId: doc.latestPublishedVersionId })
})
```

- [ ] **Step 4: Run approval tests**

Run:

```bash
npm test -- __tests__/api/v1/client-documents/approvals.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/v1/client-documents/[id]/approve app/api/v1/client-documents/[id]/accept __tests__/api/v1/client-documents/approvals.test.ts
git commit -m "feat(client-docs): add document approvals"
```

---

### Task 7: Add Public Sanitizer and Share Routes

**Objective:** Serve published share-token documents without leaking internal-only fields.

**Files:**
- Create: `lib/client-documents/public.ts`
- Create: `app/api/v1/public/client-documents/[shareToken]/route.ts`
- Create: `app/d/[shareToken]/page.tsx`
- Test: `__tests__/lib/client-documents/public.test.ts`

- [ ] **Step 1: Write failing sanitizer tests**

Create `__tests__/lib/client-documents/public.test.ts`:

```ts
import { stripPrivateDocumentFields } from '@/lib/client-documents/public'

describe('client document public sanitizer', () => {
  it('strips private document fields', () => {
    const result = stripPrivateDocumentFields({
      id: 'doc-1',
      title: 'Proposal',
      createdBy: 'ai-agent',
      updatedBy: 'admin-1',
      deleted: false,
      assumptions: [
        { text: 'Public note', severity: 'info', status: 'open' },
        { text: 'Internal pricing concern', severity: 'blocks_publish', status: 'open' },
      ],
    })
    expect(result).toEqual({
      id: 'doc-1',
      title: 'Proposal',
      assumptions: [{ text: 'Public note', severity: 'info', status: 'open' }],
    })
  })
})
```

- [ ] **Step 2: Run sanitizer test to verify failure**

Run:

```bash
npm test -- __tests__/lib/client-documents/public.test.ts
```

Expected: FAIL because `public.ts` does not exist.

- [ ] **Step 3: Add sanitizer**

Create `lib/client-documents/public.ts`:

```ts
const PRIVATE_FIELDS = new Set([
  'createdBy',
  'createdByType',
  'updatedBy',
  'updatedByType',
  'deleted',
])

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function stripPrivateDocumentFields(input: any): any {
  if (!input || typeof input !== 'object') return input
  if (Array.isArray(input)) return input.map(stripPrivateDocumentFields)
  const output: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    if (PRIVATE_FIELDS.has(key)) continue
    if (key === 'assumptions' && Array.isArray(value)) {
      output.assumptions = value.filter(a => a?.severity === 'info').map(stripPrivateDocumentFields)
      continue
    }
    output[key] = stripPrivateDocumentFields(value)
  }
  return output
}
```

- [ ] **Step 4: Add public API and page**

Create `app/api/v1/public/client-documents/[shareToken]/route.ts`. Follow `app/api/v1/public/campaigns/[shareToken]/route.ts`: query `client_documents` by `shareToken`, require `shareEnabled === true`, require not deleted, load `latestPublishedVersionId`, load that version, strip fields with `stripPrivateDocumentFields`, return `{ document, version }`.

Create `app/d/[shareToken]/page.tsx`. Fetch the same Firestore data server-side and render `DocumentRenderer`. Call `notFound()` when the token is invalid, disabled, deleted, or unpublished.

- [ ] **Step 5: Run sanitizer test**

Run:

```bash
npm test -- __tests__/lib/client-documents/public.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/client-documents/public.ts app/api/v1/public/client-documents app/d __tests__/lib/client-documents/public.test.ts
git commit -m "feat(client-docs): add public document sharing"
```

---

### Task 8: Build Renderer, Editor Shell, and Review Rail

**Objective:** Add reusable UI components for rendering and reviewing documents.

**Files:**
- Create: `components/client-documents/DocumentRenderer.tsx`
- Create: `components/client-documents/DocumentEditorShell.tsx`
- Create: `components/client-documents/DocumentReviewRail.tsx`
- Create: `components/client-documents/DocumentIndex.tsx`
- Create: `components/client-documents/index.ts`

- [ ] **Step 1: Create renderer**

Create `components/client-documents/DocumentRenderer.tsx`:

```tsx
'use client'

import type { ClientDocument, ClientDocumentVersion, DocumentBlock } from '@/lib/client-documents/types'

function renderBlock(block: DocumentBlock) {
  const content = typeof block.content === 'string' ? block.content : JSON.stringify(block.content, null, 2)
  return (
    <section
      key={block.id}
      id={`block-${block.id}`}
      className="py-10 border-b border-white/10 scroll-mt-24"
      data-motion={block.display.motion ?? 'none'}
    >
      {block.title && (
        <h2 className="text-2xl md:text-4xl font-serif mb-4 text-[var(--doc-accent)]">
          {block.title}
        </h2>
      )}
      <div className="prose prose-invert max-w-none whitespace-pre-wrap text-sm md:text-base leading-7">
        {content}
      </div>
    </section>
  )
}

export function DocumentRenderer({
  document,
  version,
}: {
  document: ClientDocument
  version: ClientDocumentVersion
}) {
  const accent = version.theme?.palette?.accent ?? '#F5A623'
  const bg = version.theme?.palette?.bg ?? '#0A0A0B'
  const text = version.theme?.palette?.text ?? '#F7F4EE'

  return (
    <article
      className="min-h-screen"
      style={{
        ['--doc-accent' as never]: accent,
        background: bg,
        color: text,
      }}
    >
      <div className="max-w-5xl mx-auto px-5 md:px-10 py-12 md:py-16">
        <header className="min-h-[42vh] flex flex-col justify-end border-b border-white/10 pb-10">
          <p className="text-xs uppercase tracking-widest text-white/50">{document.type.replaceAll('_', ' ')}</p>
          <h1 className="text-5xl md:text-7xl font-serif mt-4 max-w-4xl">{document.title}</h1>
          <p className="text-sm text-white/50 mt-6">Version {version.versionNumber}</p>
        </header>
        <div className="grid md:grid-cols-[1fr_180px] gap-10">
          <div>{version.blocks.map(renderBlock)}</div>
          <aside className="hidden md:block pt-10">
            <div className="sticky top-24 text-xs text-white/50 space-y-2">
              {version.blocks.map(block => (
                <a key={block.id} href={`#block-${block.id}`} className="block hover:text-[var(--doc-accent)]">
                  {block.title ?? block.type}
                </a>
              ))}
            </div>
          </aside>
        </div>
      </div>
    </article>
  )
}
```

- [ ] **Step 2: Create review rail**

Create `components/client-documents/DocumentReviewRail.tsx`:

```tsx
'use client'

import type { ClientDocument, DocumentAssumption, DocumentComment } from '@/lib/client-documents/types'
import { CommentList } from '@/components/inline-comments'

export function DocumentReviewRail({
  document,
  comments,
  onPublish,
}: {
  document: ClientDocument
  comments: DocumentComment[]
  onPublish?: () => void
}) {
  const blockers = (document.assumptions ?? []).filter((a: DocumentAssumption) => a.status === 'open' && a.severity === 'blocks_publish')
  return (
    <aside className="space-y-4">
      <div className="pib-card p-4">
        <p className="text-xs uppercase tracking-widest text-on-surface-variant">Status</p>
        <p className="mt-2 text-lg font-medium">{document.status.replaceAll('_', ' ')}</p>
        {blockers.length > 0 && (
          <p className="mt-3 text-xs text-amber-300">{blockers.length} blocking assumption{blockers.length === 1 ? '' : 's'}</p>
        )}
        {onPublish && (
          <button
            type="button"
            onClick={onPublish}
            disabled={blockers.length > 0}
            className="mt-4 w-full rounded-md px-3 py-2 text-sm font-medium disabled:opacity-50"
            style={{ background: 'var(--color-pib-accent)', color: '#000' }}
          >
            Publish to client
          </button>
        )}
      </div>
      <CommentList comments={comments.map(c => ({ ...c, userRole: c.userRole === 'agent' ? 'ai' : c.userRole }))} />
    </aside>
  )
}
```

- [ ] **Step 3: Create editor shell and index**

Create `components/client-documents/DocumentEditorShell.tsx`:

```tsx
'use client'

import type { ClientDocument, ClientDocumentVersion, DocumentComment } from '@/lib/client-documents/types'
import { DocumentRenderer } from './DocumentRenderer'
import { DocumentReviewRail } from './DocumentReviewRail'

export function DocumentEditorShell({
  document,
  version,
  comments,
  onPublish,
}: {
  document: ClientDocument
  version: ClientDocumentVersion
  comments: DocumentComment[]
  onPublish?: () => void
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0">
        <DocumentRenderer document={document} version={version} />
      </div>
      <div className="border-l border-[var(--color-outline)] bg-[var(--color-surface)] p-4 lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto">
        <DocumentReviewRail document={document} comments={comments} onPublish={onPublish} />
      </div>
    </div>
  )
}
```

Create `components/client-documents/DocumentIndex.tsx`:

```tsx
'use client'

import Link from 'next/link'
import type { ClientDocument } from '@/lib/client-documents/types'

export function DocumentIndex({
  documents,
  basePath,
}: {
  documents: ClientDocument[]
  basePath: string
}) {
  if (documents.length === 0) {
    return (
      <div className="pib-card p-8 text-center">
        <p className="text-sm text-on-surface-variant">No client documents yet.</p>
      </div>
    )
  }
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--color-outline)]">
      <table className="w-full text-sm">
        <thead className="bg-[var(--color-surface)] text-left text-xs uppercase tracking-widest text-on-surface-variant">
          <tr>
            <th className="px-4 py-3">Document</th>
            <th className="px-4 py-3">Type</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Linked</th>
          </tr>
        </thead>
        <tbody>
          {documents.map(doc => (
            <tr key={doc.id} className="border-t border-[var(--color-outline)]">
              <td className="px-4 py-3">
                <Link href={`${basePath}/${doc.id}`} className="font-medium hover:text-[var(--color-pib-accent)]">
                  {doc.title}
                </Link>
              </td>
              <td className="px-4 py-3 text-on-surface-variant">{doc.type.replaceAll('_', ' ')}</td>
              <td className="px-4 py-3">{doc.status.replaceAll('_', ' ')}</td>
              <td className="px-4 py-3 text-on-surface-variant">
                {Object.entries(doc.linked ?? {}).filter(([, value]) => Boolean(value)).map(([key]) => key).join(', ') || 'Standalone'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

Create `components/client-documents/index.ts`:

```ts
export { DocumentRenderer } from './DocumentRenderer'
export { DocumentEditorShell } from './DocumentEditorShell'
export { DocumentReviewRail } from './DocumentReviewRail'
export { DocumentIndex } from './DocumentIndex'
```

- [ ] **Step 4: Run TypeScript check**

Run:

```bash
./node_modules/.bin/tsc --noEmit
```

Expected: PASS for new component types. If repo-wide baseline fails outside touched files, run changed-file ESLint next and document the unrelated errors.

- [ ] **Step 5: Commit**

```bash
git add components/client-documents
git commit -m "feat(client-docs): add document renderer components"
```

---

### Task 9: Add Admin and Portal Pages

**Objective:** Make documents visible and reviewable from admin, org workspace, portal, and share URL.

**Files:**
- Create: `app/(admin)/admin/documents/page.tsx`
- Create: `app/(admin)/admin/documents/[id]/page.tsx`
- Create: `app/(admin)/admin/org/[slug]/documents/page.tsx`
- Create: `app/(admin)/admin/org/[slug]/documents/[id]/page.tsx`
- Create: `app/(portal)/portal/documents/page.tsx`
- Create: `app/(portal)/portal/documents/[id]/page.tsx`

- [ ] **Step 1: Add admin index page**

Create `app/(admin)/admin/documents/page.tsx`. The component has local `orgId`, `documents`, `loading`, and `error` state. It renders an org id input, a refresh button, and `DocumentIndex` with `basePath="/admin/documents"`. Fetch `/api/v1/client-documents?orgId=${encodeURIComponent(orgId)}` only when `orgId.trim()` is non-empty; show the error text from the API response when `success !== true`.

- [ ] **Step 2: Add org-scoped admin pages**

Create `app/(admin)/admin/org/[slug]/documents/page.tsx` and `[id]/page.tsx`. Resolve org by slug using the existing org routes/patterns used by neighbouring `/admin/org/[slug]/*` pages. Render `DocumentIndex` on the index and `DocumentEditorShell` on detail.

- [ ] **Step 3: Add portal pages**

Create `app/(portal)/portal/documents/page.tsx` and `[id]/page.tsx`. Fetch documents without passing arbitrary `orgId`; client auth should resolve their org through `resolveOrgScope`. Show only published/client-visible docs in the portal list.

- [ ] **Step 4: Add approval controls to portal detail**

In `portal/documents/[id]/page.tsx`, render:

- `Approve this version` when `approvalMode === 'operational'`.
- typed name, checkbox, and `Accept proposal` when `approvalMode === 'formal_acceptance'`.
- `Request changes` comment composer for all client-visible documents.

- [ ] **Step 5: Run focused lint**

Run:

```bash
npx eslint components/client-documents app/(admin)/admin/documents app/(portal)/portal/documents
```

Expected: PASS. If shell globbing fails because of parentheses, quote each path.

- [ ] **Step 6: Commit**

```bash
git add app/(admin)/admin/documents app/(admin)/admin/org/[slug]/documents app/(portal)/portal/documents
git commit -m "feat(client-docs): add document workspaces"
```

---

### Task 10: Add Linked Object Adapters

**Objective:** Let other modules link to client documents without owning collaboration behavior.

**Files:**
- Create: `lib/client-documents/links.ts`
- Modify: `app/api/v1/projects/[projectId]/docs/route.ts`
- Modify: `app/api/v1/projects/[projectId]/docs/[docId]/route.ts`
- Test: extend `__tests__/api/projects.test.ts` or add `__tests__/api/v1/client-documents/links.test.ts`

- [ ] **Step 1: Add link helper**

Create `lib/client-documents/links.ts`:

```ts
import type { ClientDocument, ClientDocumentLinkSet } from './types'

export function documentLinksTo(entity: keyof ClientDocumentLinkSet, id: string, doc: Pick<ClientDocument, 'linked'>): boolean {
  const value = doc.linked?.[entity]
  if (Array.isArray(value)) return value.includes(id)
  return value === id
}

export function mergeDocumentLinks(current: ClientDocumentLinkSet, next: ClientDocumentLinkSet): ClientDocumentLinkSet {
  return {
    ...current,
    ...Object.fromEntries(Object.entries(next).filter(([, value]) => value !== undefined && value !== null && value !== '')),
  }
}
```

- [ ] **Step 2: Keep legacy project docs read-compatible**

Modify `app/api/v1/projects/[projectId]/docs/route.ts` so `GET` returns both legacy subcollection docs and linked `client_documents` where `linked.projectId === projectId`. Keep legacy `POST` behavior for now, but add `migrationTarget: 'client_documents'` to the JSON response so new UI work knows the preferred creation target.

- [ ] **Step 3: Add link tests**

Create `__tests__/api/v1/client-documents/links.test.ts`:

```ts
import { documentLinksTo, mergeDocumentLinks } from '@/lib/client-documents/links'

describe('client document links', () => {
  it('matches scalar linked ids', () => {
    expect(documentLinksTo('projectId', 'project-1', { linked: { projectId: 'project-1' } })).toBe(true)
    expect(documentLinksTo('projectId', 'other', { linked: { projectId: 'project-1' } })).toBe(false)
  })

  it('matches array linked ids', () => {
    expect(documentLinksTo('socialPostIds', 'post-1', { linked: { socialPostIds: ['post-1'] } })).toBe(true)
  })

  it('merges non-empty links', () => {
    expect(mergeDocumentLinks({ projectId: 'p1' }, { campaignId: 'c1', dealId: '' })).toEqual({
      projectId: 'p1',
      campaignId: 'c1',
    })
  })
})
```

- [ ] **Step 4: Run link tests**

Run:

```bash
npm test -- __tests__/api/v1/client-documents/links.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/client-documents/links.ts app/api/v1/projects/[projectId]/docs app/api/v1/projects/[projectId]/docs/[docId] __tests__/api/v1/client-documents/links.test.ts
git commit -m "feat(client-docs): link documents to work objects"
```

---

### Task 11: Add and Sync Agent Skills

**Objective:** Teach agents to create and link client documents through the new platform module.

**Files:**
- Create: `.claude/skills/client-documents/SKILL.md`
- Modify: `scripts/install-platform-skills.sh`
- Modify: `.claude/skills/content-engine/SKILL.md`
- Modify: `.claude/skills/project-management/SKILL.md`
- Modify: `.claude/skills/client-manager/SKILL.md`
- Modify: `.claude/skills/crm-sales/SKILL.md`
- Modify: `.claude/skills/seo-sprint-manager/SKILL.md`
- Modify: `.claude/skills/social-media-manager/SKILL.md`

- [ ] **Step 1: Add new skill**

Create `.claude/skills/client-documents/SKILL.md`:

```md
---
name: client-documents
description: Create, review, publish, and track client-facing PiB documents including proposals, specs, social strategies, content campaign plans, reports, launch sign-offs, and change requests.
---

# Client Documents

Use this whenever Peet asks for a proposal, spec, strategy document, sign-off, report, change request, approval pack, or any client-facing document.

## Source of Truth

Documents live in the Partners in Biz platform as `client_documents`. They are the collaboration and approval layer. Projects, campaigns, CRM deals, reports, SEO sprints, and social posts remain the operational source of truth and are linked through `document.linked`.

## Default Workflow

1. Resolve the client org.
2. Choose the right template:
   - Sales Proposal -> `sales_proposal`
   - Website/App Build Spec -> `build_spec`
   - Social Media Strategy -> `social_strategy`
   - Content Campaign Plan -> `content_campaign_plan`
   - Monthly Report -> `monthly_report`
   - Launch Sign-off -> `launch_signoff`
   - Change Request -> `change_request`
3. Pull context from org profile, brand profile, wiki, projects, campaigns, reports, CRM deals, SEO sprints, and social records.
4. Create an internal draft through `POST /api/v1/client-documents`.
5. Mark assumptions inside `assumptions[]`.
6. Keep formal acceptance documents internal until price, legal terms, dates, and scope are resolved.
7. Publish only when the template rules allow it.
8. Return admin and client URLs.

## Assumptions

Draft with visible assumptions when context is incomplete. Use `severity: blocks_publish` for price, legal terms, binding dates, and final scope. Use `needs_review` for positioning, wording, references, and low-risk scope details.

## Publishing

Use `POST /api/v1/client-documents/[id]/publish` only after blocking assumptions are resolved and the document has an `orgId`. Publishing creates the client review state and enables the share token.

## Approval

Operational approvals are for specs, reports, launch sign-offs, and change requests. Formal acceptance is for sales proposals and SOW-like documents. Never mutate an approved version; create a new version for later changes.
```

- [ ] **Step 2: Add skill to install script**

Modify `scripts/install-platform-skills.sh` and add `client-documents` to `PLATFORM_SKILLS`, near `client-manager`.

- [ ] **Step 3: Update related skills**

Append concise cross-reference sections:

- `content-engine`: after campaign creation, create or link a Content Campaign Plan document for major runs.
- `project-management`: specs, change requests, and launch sign-offs belong in client documents and link back to the project.
- `client-manager`: check outstanding document approvals during handoff/review.
- `crm-sales`: sales opportunities produce Sales Proposal documents.
- `seo-sprint-manager`: strategy sign-off uses client documents.
- `social-media-manager`: broader social strategy sign-off uses client documents; individual post approval stays in social posts.

- [ ] **Step 4: Run install script**

Run:

```bash
bash scripts/install-platform-skills.sh
```

Expected: output includes `linked client-documents` or `refreshed client-documents`.

- [ ] **Step 5: Commit**

```bash
git add .claude/skills scripts/install-platform-skills.sh
git commit -m "docs(skills): add client documents skill"
```

---

### Task 12: Final Verification and Build

**Objective:** Prove the module works end to end and does not break the app.

**Files:**
- No new files unless verification reveals defects.

- [ ] **Step 1: Run focused test suite**

Run:

```bash
npm test -- __tests__/lib/client-documents __tests__/api/v1/client-documents
```

Expected: PASS.

- [ ] **Step 2: Run changed-surface lint**

Run:

```bash
npx eslint lib/client-documents components/client-documents app/api/v1/client-documents app/api/v1/public/client-documents app/d
```

Expected: PASS.

- [ ] **Step 3: Run TypeScript**

Run:

```bash
./node_modules/.bin/tsc --noEmit
```

Expected: PASS. If unrelated baseline errors appear, capture exact file paths and confirm none are in client-document files.

- [ ] **Step 4: Run production build**

Run:

```bash
NODE_OPTIONS=--max-old-space-size=8192 npm run build
```

Expected: PASS.

- [ ] **Step 5: Manual smoke test**

Start dev server:

```bash
npm run dev
```

Create an internal draft via API:

```bash
curl -s -X POST 'http://localhost:3000/api/v1/client-documents' \
  -H "Authorization: Bearer $AI_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"orgId":"pib-platform-owner","title":"Smoke Sales Proposal","type":"sales_proposal","assumptions":[{"text":"Budget must be confirmed","severity":"blocks_publish"}]}'
```

Expected: JSON response has `success: true`, `data.id`, `data.versionId`, and `data.shareToken`.

- [ ] **Step 6: Final commit if verification fixes were needed**

If verification required changes:

```bash
git add <changed-files>
git commit -m "fix(client-docs): resolve verification findings"
```

If no fixes were needed, do not create an empty commit.
