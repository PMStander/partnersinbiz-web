import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess } from '@/lib/api/response'

export const dynamic = 'force-dynamic'

interface ReplySuggestion {
  topic: string
  searchQuery: string
  draftReply: string
  context: string
}

const ENGAGEMENT_TOPICS_CONFIG: ReplySuggestion[] = [
  {
    topic: 'dev agencies',
    searchQuery: '"dev agency" OR "development agency" -is:retweet lang:en',
    draftReply: '[Claude: draft a reply to a post about dev agencies]',
    context: 'Engage with other agency owners and potential clients evaluating agencies',
  },
  {
    topic: 'offshore development',
    searchQuery: '"offshore dev" OR "offshore development" OR "nearshore" -is:retweet lang:en',
    draftReply: '[Claude: draft a reply to a post about offshore development]',
    context: 'Position PiB as a premium offshore option for US/EU buyers',
  },
  {
    topic: 'sports tech',
    searchQuery: '"sports tech" OR "sportstech" OR "wrestling club" OR "coaching software" -is:retweet lang:en',
    draftReply: '[Claude: draft a reply to a post about sports tech]',
    context: 'Athleet product — target coaches, clubs, and sports software buyers',
  },
  {
    topic: 'AI automation',
    searchQuery: '"AI automation" OR "agentic AI" OR "AI workflow" -is:retweet lang:en',
    draftReply: '[Claude: draft a reply to a post about AI automation]',
    context: 'Showcase AI-powered development approach and tooling',
  },
  {
    topic: 'solo founder',
    searchQuery: '"solo founder" OR "solopreneur" OR "building alone" -is:retweet lang:en',
    draftReply: '[Claude: draft a reply to a post about solo founder]',
    context: 'Community building — Peet is a solo founder building in public',
  },
  {
    topic: 'South Africa tech',
    searchQuery: '"South Africa tech" OR "#satech" OR "Cape Town startup" OR "Johannesburg dev" -is:retweet lang:en',
    draftReply: '[Claude: draft a reply to a post about South Africa tech]',
    context: 'Local ecosystem visibility and credibility building',
  },
  {
    topic: 'Next.js',
    searchQuery: '"Next.js" OR "nextjs" -is:retweet lang:en',
    draftReply: '[Claude: draft a reply to a post about Next.js]',
    context: 'Technical credibility — core stack for all PiB products',
  },
  {
    topic: 'build in public',
    searchQuery: '"build in public" OR "#buildinpublic" -is:retweet lang:en',
    draftReply: '[Claude: draft a reply to a post about build in public]',
    context: 'Growth strategy — sharing the PiB journey openly for inbound leads',
  },
]

export const GET = withAuth('admin', async (req: NextRequest) => {
  return apiSuccess(ENGAGEMENT_TOPICS_CONFIG)
})
