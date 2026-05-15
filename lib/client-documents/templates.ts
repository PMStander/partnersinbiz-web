import type {
  ClientDocumentTemplate,
  ClientDocumentType,
  DocumentBlock,
  DocumentBlockType,
} from './types'

const BASE_DISPLAY = { motion: 'reveal' as const }

function block(type: DocumentBlockType, title: string, content: unknown = ''): DocumentBlock {
  return {
    id: type,
    type,
    title,
    content,
    required: true,
    display: { ...BASE_DISPLAY },
  }
}

function cloneContent(content: unknown): unknown {
  if (content === null || typeof content !== 'object') {
    return content
  }

  return structuredClone(content)
}

export const CLIENT_DOCUMENT_TEMPLATES: ClientDocumentTemplate[] = [
  {
    id: 'sales-proposal-v1',
    type: 'sales_proposal',
    label: 'Sales Proposal',
    approvalMode: 'formal_acceptance',
    clientPermissions: {
      canComment: true,
      canSuggest: true,
      canDirectEdit: false,
      canApprove: true,
    },
    requiredBlockTypes: [
      'hero',
      'problem',
      'scope',
      'deliverables',
      'timeline',
      'investment',
      'terms',
      'approval',
    ],
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
    clientPermissions: {
      canComment: true,
      canSuggest: true,
      canDirectEdit: false,
      canApprove: true,
    },
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
    clientPermissions: {
      canComment: true,
      canSuggest: true,
      canDirectEdit: false,
      canApprove: true,
    },
    requiredBlockTypes: [
      'hero',
      'summary',
      'problem',
      'deliverables',
      'timeline',
      'metrics',
      'approval',
    ],
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
    clientPermissions: {
      canComment: true,
      canSuggest: true,
      canDirectEdit: false,
      canApprove: true,
    },
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
    clientPermissions: {
      canComment: true,
      canSuggest: true,
      canDirectEdit: false,
      canApprove: true,
    },
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
    clientPermissions: {
      canComment: true,
      canSuggest: true,
      canDirectEdit: false,
      canApprove: true,
    },
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
    clientPermissions: {
      canComment: true,
      canSuggest: true,
      canDirectEdit: true,
      canApprove: true,
    },
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
  const template = CLIENT_DOCUMENT_TEMPLATES.find(candidate => candidate.type === type)

  if (!template) {
    throw new Error(`Unknown client document template type: ${type}`)
  }

  return template
}

export function createBlocksFromTemplate(type: ClientDocumentType): DocumentBlock[] {
  return getClientDocumentTemplate(type).defaultBlocks.map(templateBlock => ({
    ...templateBlock,
    content: cloneContent(templateBlock.content),
    display: { ...templateBlock.display },
  }))
}
