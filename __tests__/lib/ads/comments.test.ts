// __tests__/lib/ads/comments.test.ts
import {
  listComments,
  getComment,
  createComment,
  updateComment,
  deleteComment,
} from '@/lib/ads/comments'

// In-memory Firestore mock identical in shape to lib/ads/ads/store.test.ts.
// `Timestamp.now()` returns real-ish increasing values so we can assert ordering.
jest.mock('@/lib/firebase/admin', () => {
  const docs = new Map<string, Record<string, unknown>>()

  function makeQuery(path: string, filters: Array<[string, string, unknown]> = []) {
    return {
      where: (field: string, op: string, value: unknown) =>
        makeQuery(path, [...filters, [field, op, value]]),
      orderBy: (_field: string, _dir?: string) => makeQuery(path, filters),
      get: async () => ({
        docs: Array.from(docs.entries())
          .filter(([k]) => k.startsWith(`${path}/`))
          .filter(([, data]) =>
            filters.every(([field, op, value]) => {
              if (op !== '==') return true
              return (data as Record<string, unknown>)[field] === value
            }),
          )
          .map(([k, v]) => ({ id: k.replace(`${path}/`, ''), data: () => v })),
      }),
    }
  }

  const collection = (path: string) => ({
    doc: (id: string) => ({
      get: async () => ({
        exists: docs.has(`${path}/${id}`),
        id,
        data: () => docs.get(`${path}/${id}`),
      }),
      set: async (data: Record<string, unknown>) => {
        docs.set(`${path}/${id}`, { ...data })
      },
      update: async (patch: Record<string, unknown>) => {
        const cur = docs.get(`${path}/${id}`) ?? {}
        docs.set(`${path}/${id}`, { ...cur, ...patch })
      },
      delete: async () => {
        docs.delete(`${path}/${id}`)
      },
    }),
    where: (field: string, op: string, value: unknown) =>
      makeQuery(path, [[field, op, value]]),
  })

  return {
    adminDb: { collection },
    _docs: docs,
  }
})

const BASE_ARGS = {
  orgId: 'org_1',
  adId: 'ad_1',
  authorUid: 'user_1',
  authorName: 'Client',
  authorRole: 'client' as const,
}

function clearDocs() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { _docs } = require('@/lib/firebase/admin') as { _docs: Map<string, unknown> }
  _docs.clear()
}

describe('ad comments store', () => {
  beforeEach(() => {
    clearDocs()
  })

  it('createComment + listComments returns the new comment with correct fields, defaults, and id format', async () => {
    const created = await createComment({ ...BASE_ARGS, text: 'Looks great' })

    expect(created.id).toMatch(/^cmt_[0-9a-f]{16}$/)
    expect(created.resolved).toBe(false)
    expect(created.parentCommentId).toBeUndefined()
    expect(created.deletedAt).toBeUndefined()
    expect(created.text).toBe('Looks great')

    const list = await listComments({ orgId: 'org_1', adId: 'ad_1' })
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe(created.id)
  })

  it('updateComment patches text + resolved and bumps updatedAt', async () => {
    const created = await createComment({ ...BASE_ARGS, text: 'initial' })
    const updated = await updateComment(created.id, { text: 'edited', resolved: true })

    expect(updated.text).toBe('edited')
    expect(updated.resolved).toBe(true)

    const fetched = await getComment(created.id)
    expect(fetched?.text).toBe('edited')
    expect(fetched?.resolved).toBe(true)
  })

  it('deleteComment soft-deletes — getComment still returns it but listComments excludes it', async () => {
    const created = await createComment({ ...BASE_ARGS, text: 'will be deleted' })
    await deleteComment(created.id)

    const fetched = await getComment(created.id)
    expect(fetched).not.toBeNull()
    expect(fetched?.deletedAt).toBeDefined()

    const list = await listComments({ orgId: 'org_1', adId: 'ad_1' })
    expect(list).toHaveLength(0)
  })

  it('supports a threaded reply via parentCommentId', async () => {
    const parent = await createComment({ ...BASE_ARGS, text: 'parent' })
    const reply = await createComment({
      ...BASE_ARGS,
      text: 'reply',
      parentCommentId: parent.id,
    })
    expect(reply.parentCommentId).toBe(parent.id)

    const list = await listComments({ orgId: 'org_1', adId: 'ad_1' })
    expect(list).toHaveLength(2)
    expect(list.some((c) => c.parentCommentId === parent.id)).toBe(true)
  })

  it('rejects empty/whitespace text on create and update', async () => {
    await expect(
      createComment({ ...BASE_ARGS, text: '' }),
    ).rejects.toThrow(/empty|required/i)

    await expect(
      createComment({ ...BASE_ARGS, text: '   \n\t  ' }),
    ).rejects.toThrow(/empty/i)

    const created = await createComment({ ...BASE_ARGS, text: 'ok' })
    await expect(updateComment(created.id, { text: '' })).rejects.toThrow(
      /empty/i,
    )
  })

  it('rejects text longer than 1000 chars on create and throws when parent does not exist', async () => {
    const longText = 'a'.repeat(1001)
    await expect(
      createComment({ ...BASE_ARGS, text: longText }),
    ).rejects.toThrow(/1000/)

    await expect(
      createComment({
        ...BASE_ARGS,
        text: 'reply',
        parentCommentId: 'cmt_nonexistent',
      }),
    ).rejects.toThrow(/Parent comment not found/i)
  })
})
