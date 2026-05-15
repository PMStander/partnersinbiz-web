import { documentLinksTo, mergeDocumentLinks } from '@/lib/client-documents/links'

describe('client document links', () => {
  it('matches scalar linked ids', () => {
    expect(documentLinksTo('projectId', 'project-1', { linked: { projectId: 'project-1' } })).toBe(true)
    expect(documentLinksTo('projectId', 'other', { linked: { projectId: 'project-1' } })).toBe(false)
  })

  it('matches array linked ids', () => {
    expect(documentLinksTo('socialPostIds', 'post-1', { linked: { socialPostIds: ['post-1'] } })).toBe(true)
    expect(documentLinksTo('socialPostIds', 'other', { linked: { socialPostIds: ['post-1'] } })).toBe(false)
  })

  it('merges non-empty links', () => {
    expect(mergeDocumentLinks({ projectId: 'p1' }, { campaignId: 'c1', dealId: '' })).toEqual({
      projectId: 'p1',
      campaignId: 'c1',
    })
  })
})
