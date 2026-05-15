import {
  CLIENT_DOCUMENT_TEMPLATES,
  createBlocksFromTemplate,
  getClientDocumentTemplate,
} from '@/lib/client-documents/templates'

describe('client document templates', () => {
  it('ships the first seven approved templates', () => {
    expect(CLIENT_DOCUMENT_TEMPLATES.map(template => template.type)).toEqual([
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

    expect(blocks.map(block => block.id)).toEqual([
      'hero',
      'summary',
      'scope',
      'deliverables',
      'timeline',
      'risk',
      'approval',
    ])
    expect(blocks.every(block => block.required)).toBe(true)
  })

  it('deep-clones object content from template defaults', () => {
    const template = getClientDocumentTemplate('build_spec')
    const templateBlock = template.defaultBlocks[0]
    const originalContent = templateBlock.content
    const objectContent = { sections: [{ label: 'Scope', items: ['Homepage'] }] }

    try {
      templateBlock.content = objectContent

      const [generatedBlock] = createBlocksFromTemplate('build_spec')

      expect(generatedBlock.content).toEqual(objectContent)
      expect(generatedBlock.content).not.toBe(objectContent)
      expect((generatedBlock.content as typeof objectContent).sections).not.toBe(objectContent.sections)
      expect((generatedBlock.content as typeof objectContent).sections[0]).not.toBe(objectContent.sections[0])
    } finally {
      templateBlock.content = originalContent
    }
  })
})
