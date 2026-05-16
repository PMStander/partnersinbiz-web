import { displayCreatedBy, displayUpdatedBy } from '@/lib/crm/displayCreatedBy'
import { LEGACY_REF } from '@/lib/orgMembers/memberRef'

describe('displayCreatedBy', () => {
  it('returns createdByRef when present', () => {
    const ref = { uid: 'u1', displayName: 'Alice', kind: 'human' as const }
    expect(displayCreatedBy({ createdByRef: ref })).toBe(ref)
  })

  it('returns LEGACY_REF when createdByRef is missing', () => {
    expect(displayCreatedBy({})).toEqual(LEGACY_REF)
  })

  it('returns LEGACY_REF when createdByRef is null', () => {
    expect(displayCreatedBy({ createdByRef: null as any })).toEqual(LEGACY_REF)
  })
})

describe('displayUpdatedBy', () => {
  it('returns updatedByRef when present', () => {
    const ref = { uid: 'u1', displayName: 'Alice', kind: 'human' as const }
    expect(displayUpdatedBy({ updatedByRef: ref })).toBe(ref)
  })

  it('falls back to createdByRef when updatedByRef missing', () => {
    const created = { uid: 'u1', displayName: 'Alice', kind: 'human' as const }
    expect(displayUpdatedBy({ createdByRef: created })).toBe(created)
  })

  it('falls back to LEGACY_REF when both missing', () => {
    expect(displayUpdatedBy({})).toEqual(LEGACY_REF)
  })
})
