import { sprintIdsForUser, requireSprintAccess } from '@/lib/seo/tenant'

const mockGet = jest.fn()
const mockWhere = jest.fn(() => ({ get: mockGet }))
jest.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: () => ({ where: mockWhere, doc: () => ({ get: mockGet }) }) },
}))

describe('seo/tenant', () => {
  it('sprintIdsForUser scopes by orgId', async () => {
    mockGet.mockResolvedValueOnce({ docs: [{ id: 's1' }, { id: 's2' }] })
    const ids = await sprintIdsForUser({ uid: 'u1', role: 'admin', orgId: 'o1' } as any)
    expect(ids).toEqual(['s1', 's2'])
    expect(mockWhere).toHaveBeenCalledWith('orgId', '==', 'o1')
  })

  it('requireSprintAccess throws when sprint orgId mismatch', async () => {
    mockGet.mockResolvedValueOnce({ exists: true, data: () => ({ orgId: 'other-org', deleted: false }) })
    await expect(
      requireSprintAccess('s1', { uid: 'u1', role: 'admin', orgId: 'o1' } as any),
    ).rejects.toThrow(/access/i)
  })

  it('requireSprintAccess returns sprint when orgId matches', async () => {
    mockGet.mockResolvedValueOnce({ exists: true, data: () => ({ orgId: 'o1', deleted: false, siteName: 'X' }) })
    const sprint = await requireSprintAccess('s1', { uid: 'u1', role: 'admin', orgId: 'o1' } as any)
    expect(sprint.siteName).toBe('X')
  })
})
