/**
 * Tests for lib/social/regenerate.ts.
 *
 * regeneratePost wires together Firestore (via adminDb) and Claude (via the
 * `ai` package's generateText). We mock both so the helper is exercised in
 * isolation.
 *
 * Firestore mocking strategy: a tiny in-memory shim that returns chainable
 * objects whose final method (.get(), .commit()) is a jest.fn we can pre-arm
 * with the data the helper expects to see.
 */

// ---- Mocks --------------------------------------------------------------

const mockGenerateText = jest.fn()
jest.mock('ai', () => ({
  generateText: (...args: unknown[]) => mockGenerateText(...args),
}))

// FieldValue / Timestamp shim — regeneratePost only uses FieldValue.serverTimestamp()
jest.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    serverTimestamp: () => '__SERVER_TS__',
  },
}))

// Audit logger — fire-and-forget, never throws.
const mockLogAudit = jest.fn().mockResolvedValue(undefined)
jest.mock('@/lib/social/audit', () => ({
  logAudit: (...args: unknown[]) => mockLogAudit(...args),
}))

jest.mock('@/lib/ai/client', () => ({
  BRIEF_MODEL: 'test-model',
}))

// --- Firestore shim -------------------------------------------------------
// Each test sets `postSnap` and `commentDocs`, and we record .update / .set /
// .commit calls to assert against later.

interface SnapShape {
  exists: boolean
  data: () => Record<string, unknown> | undefined
}
interface CommentDoc {
  id: string
  data: () => Record<string, unknown>
}

let postSnap: SnapShape = { exists: false, data: () => undefined }
let commentDocs: CommentDoc[] = []
const updateMock = jest.fn().mockResolvedValue(undefined)
const batchUpdateMock = jest.fn()
const batchSetMock = jest.fn()
const batchCommitMock = jest.fn().mockResolvedValue(undefined)
const newCommentDocId = 'new-comment-doc'

function buildCommentsCollection() {
  return {
    where: () => ({
      orderBy: () => ({
        get: jest.fn().mockResolvedValue({ docs: commentDocs }),
      }),
    }),
    doc: (id?: string) => ({ id: id ?? newCommentDocId }),
  }
}

function buildPostDocRef() {
  return {
    get: jest.fn().mockImplementation(() => Promise.resolve(postSnap)),
    update: updateMock,
    collection: (name: string) => {
      if (name === 'comments') return buildCommentsCollection()
      throw new Error(`Unexpected sub-collection: ${name}`)
    },
  }
}

const mockBatch = {
  update: batchUpdateMock,
  set: batchSetMock,
  commit: batchCommitMock,
}

jest.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: (name: string) => {
      if (name !== 'social_posts') throw new Error(`Unexpected collection: ${name}`)
      return {
        doc: () => buildPostDocRef(),
      }
    },
    batch: () => mockBatch,
  },
}))

// ---- Imports under test --------------------------------------------------

import { regeneratePost } from '@/lib/social/regenerate'

// ---- Helpers -------------------------------------------------------------

function setPost(data: Record<string, unknown> | null) {
  if (data === null) {
    postSnap = { exists: false, data: () => undefined }
  } else {
    postSnap = { exists: true, data: () => data }
  }
}

function setComments(rows: Array<{ id: string; data: Record<string, unknown> }>) {
  commentDocs = rows.map((r) => ({ id: r.id, data: () => r.data }))
}

beforeEach(() => {
  jest.clearAllMocks()
  setPost(null)
  setComments([])
  mockGenerateText.mockResolvedValue({ text: 'Revised content from Claude.' })
})

// ---- Tests ---------------------------------------------------------------

describe('regeneratePost — guard rails', () => {
  it('throws when post not found', async () => {
    setPost(null)
    await expect(
      regeneratePost({ postId: 'p1', orgId: 'org-1', actorUid: 'u', actorRole: 'admin' }),
    ).rejects.toThrow(/not found/)
  })

  it('throws when post.orgId does not match input.orgId', async () => {
    setPost({
      orgId: 'org-other',
      content: { text: 'hello' },
      platforms: ['twitter'],
    })
    await expect(
      regeneratePost({ postId: 'p1', orgId: 'org-1', actorUid: 'u', actorRole: 'admin' }),
    ).rejects.toThrow(/does not belong to org/)
  })

  it('throws when there is no unresolved rejection feedback', async () => {
    setPost({
      orgId: 'org-1',
      content: { text: 'hello' },
      platforms: ['twitter'],
    })
    setComments([]) // no comments at all
    await expect(
      regeneratePost({ postId: 'p1', orgId: 'org-1', actorUid: 'u', actorRole: 'admin' }),
    ).rejects.toThrow(/No unresolved rejection feedback/)
  })

  it('throws when comments exist but none are rejection comments', async () => {
    setPost({
      orgId: 'org-1',
      content: { text: 'hello' },
      platforms: ['twitter'],
    })
    setComments([
      { id: 'c1', data: { kind: 'note', text: 'just a note', userName: 'Alice' } },
      { id: 'c2', data: { kind: 'agent_handoff', text: 'previous handoff', userName: 'Pip' } },
    ])
    await expect(
      regeneratePost({ postId: 'p1', orgId: 'org-1', actorUid: 'u', actorRole: 'admin' }),
    ).rejects.toThrow(/No unresolved rejection feedback/)
  })
})

describe('regeneratePost — happy path', () => {
  it('returns RegenerateResult, increments regenerationCount, sets status to qa_review, marks comments + posts handoff', async () => {
    setPost({
      orgId: 'org-1',
      content: { text: 'Old draft text' },
      platforms: ['linkedin'],
      approval: { regenerationCount: 0, lastRejectedAt: null },
    })
    setComments([
      { id: 'c1', data: { kind: 'qa_rejection', text: 'Tone is off', userName: 'QA' } },
      { id: 'c2', data: { kind: 'client_rejection', text: 'Make it punchier', userName: 'Client' } },
    ])
    mockGenerateText.mockResolvedValueOnce({ text: '  Revised punchier draft.  ' })

    const result = await regeneratePost({
      postId: 'p1',
      orgId: 'org-1',
      actorUid: 'admin-1',
      actorRole: 'admin',
    })

    // Result shape
    expect(result.postId).toBe('p1')
    expect(result.newStatus).toBe('qa_review')
    expect(result.oldText).toBe('Old draft text')
    expect(result.newText).toBe('Revised punchier draft.')
    expect(result.regenerationCount).toBe(1)
    expect(result.feedbackUsed).toHaveLength(2)
    expect(result.feedbackUsed.map((f) => f.commentId)).toEqual(['c1', 'c2'])
    expect(result.feedbackUsed[0].stage).toBe('qa')
    expect(result.feedbackUsed[1].stage).toBe('client')

    // Post update — status flipped to qa_review and regenerationCount incremented
    expect(updateMock).toHaveBeenCalledTimes(1)
    const updatePayload = updateMock.mock.calls[0][0] as Record<string, unknown>
    expect(updatePayload['status']).toBe('qa_review')
    expect(updatePayload['content.text']).toBe('Revised punchier draft.')
    expect(updatePayload['approval.regenerationCount']).toBe(1)
    expect(updatePayload['originalContent']).toBe('Old draft text') // first regen, preserved

    // Comments marked as picked up + a handoff comment written
    expect(batchUpdateMock).toHaveBeenCalledTimes(2)
    for (const call of batchUpdateMock.mock.calls) {
      const update = call[1] as Record<string, unknown>
      expect(update.agentPickedUp).toBe(true)
    }
    expect(batchSetMock).toHaveBeenCalledTimes(1)
    const handoff = batchSetMock.mock.calls[0][1] as Record<string, unknown>
    expect(handoff.kind).toBe('agent_handoff')
    expect(handoff.userRole).toBe('ai')
    expect(handoff.agentPickedUp).toBe(true)
    expect(handoff.text).toMatch(/2 pieces/)

    expect(batchCommitMock).toHaveBeenCalledTimes(1)

    // Audit logged
    expect(mockLogAudit).toHaveBeenCalledTimes(1)
    const auditArgs = mockLogAudit.mock.calls[0][0] as Record<string, unknown>
    expect(auditArgs.action).toBe('post.regenerated')
    expect(auditArgs.entityId).toBe('p1')
    expect(auditArgs.performedBy).toBe('admin-1')
  })

  it('preserves originalContent on first regen, does NOT overwrite on subsequent regens', async () => {
    // --- First regen: originalContent absent on the post ---
    setPost({
      orgId: 'org-1',
      content: { text: 'first draft' },
      platforms: ['twitter'],
      approval: { regenerationCount: 0 },
      // originalContent intentionally not set
    })
    setComments([{ id: 'r1', data: { kind: 'qa_rejection', text: 'fix this', userName: 'QA' } }])
    mockGenerateText.mockResolvedValueOnce({ text: 'second draft' })

    await regeneratePost({ postId: 'p1', orgId: 'org-1', actorUid: 'u', actorRole: 'admin' })

    let updatePayload = updateMock.mock.calls[0][0] as Record<string, unknown>
    expect(updatePayload['originalContent']).toBe('first draft')
    expect(updatePayload['approval.regenerationCount']).toBe(1)

    // --- Second regen: post already has originalContent set; should NOT overwrite ---
    jest.clearAllMocks()
    setPost({
      orgId: 'org-1',
      content: { text: 'second draft' },
      platforms: ['twitter'],
      approval: { regenerationCount: 1 },
      originalContent: 'first draft', // already preserved
    })
    setComments([{ id: 'r2', data: { kind: 'client_rejection', text: 'still wrong', userName: 'Client' } }])
    mockGenerateText.mockResolvedValueOnce({ text: 'third draft' })

    await regeneratePost({ postId: 'p1', orgId: 'org-1', actorUid: 'u', actorRole: 'admin' })

    updatePayload = updateMock.mock.calls[0][0] as Record<string, unknown>
    expect('originalContent' in updatePayload).toBe(false) // not in update payload
    expect(updatePayload['approval.regenerationCount']).toBe(2)
  })

  it('strips wrapping triple-quotes from the model output', async () => {
    setPost({
      orgId: 'org-1',
      content: { text: 'old' },
      platforms: ['twitter'],
      approval: { regenerationCount: 0 },
    })
    setComments([{ id: 'c1', data: { kind: 'qa_rejection', text: 'change it', userName: 'QA' } }])
    mockGenerateText.mockResolvedValueOnce({ text: '"""\nReal text\n"""' })

    const result = await regeneratePost({
      postId: 'p1',
      orgId: 'org-1',
      actorUid: 'u',
      actorRole: 'admin',
    })

    expect(result.newText).toBe('Real text')
  })
})
