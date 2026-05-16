import { decideAttribution } from '@/scripts/crm-backfill-attribution'
import { LEGACY_REF, FORMER_MEMBER_REF } from '@/lib/orgMembers/memberRef'

const ORG = 'org-1'

const realLookup = async (orgId: string, uid: string) => ({
  uid,
  displayName: 'Real Member',
  kind: 'human' as const,
})

const missingLookup = async () => null

describe('decideAttribution', () => {
  it('skips when createdByRef already present', async () => {
    const patch = await decideAttribution(
      { createdByRef: { uid: 'u1', displayName: 'X', kind: 'human' } },
      ORG,
      realLookup,
    )
    expect(patch).toBeNull()
  })

  it('resolves createdByRef from real member when createdBy uid present', async () => {
    const patch = await decideAttribution({ createdBy: 'u1', createdAt: null }, ORG, realLookup)
    expect(patch?.createdByRef?.displayName).toBe('Real Member')
    expect(patch?.createdByRef?.kind).toBe('human')
  })

  it('uses FORMER_MEMBER_REF when uid present but member doc missing', async () => {
    const patch = await decideAttribution({ createdBy: 'u1' }, ORG, missingLookup)
    expect(patch?.createdByRef).toEqual(FORMER_MEMBER_REF('u1'))
  })

  it('uses LEGACY_REF when no createdBy uid at all', async () => {
    const patch = await decideAttribution({}, ORG, realLookup)
    expect(patch?.createdByRef).toEqual(LEGACY_REF)
  })

  it('resolves updatedByRef when updatedBy uid present', async () => {
    const patch = await decideAttribution(
      { createdBy: 'u1', updatedBy: 'u2' },
      ORG,
      realLookup,
    )
    expect(patch?.updatedByRef?.displayName).toBe('Real Member')
    expect(patch?.createdByRef?.displayName).toBe('Real Member')
  })

  it('copies createdByRef onto updatedByRef when no updatedBy uid', async () => {
    const patch = await decideAttribution({ createdBy: 'u1' }, ORG, realLookup)
    expect(patch?.updatedByRef).toEqual(patch?.createdByRef)
  })

  it('uses LEGACY_REF on both fields when record is fully bare', async () => {
    const patch = await decideAttribution({}, ORG, missingLookup)
    expect(patch?.createdByRef).toEqual(LEGACY_REF)
    expect(patch?.updatedByRef).toEqual(LEGACY_REF)
  })
})
