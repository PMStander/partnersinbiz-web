import type { HealthSignal } from '@/lib/seo/types'

export interface HypothesisProposal {
  hypothesis: string
  hypothesisType: string
  proposedAction: string
  generatedTasks: { title: string; taskType: string; week: number; phase: 4; autopilotEligible: boolean }[]
}

const TEMPLATES: Record<string, (s: HealthSignal) => HypothesisProposal[]> = {
  stuck_page: (s) => [
    {
      hypothesis: 'Page lacks depth and FAQ schema',
      hypothesisType: 'stuck_page:depth-faq',
      proposedAction: `Rewrite "${s.evidence.keyword}" target page with deeper coverage + FAQ schema`,
      generatedTasks: [
        {
          title: `Rewrite stuck page for "${s.evidence.keyword}" — add depth + FAQ`,
          taskType: 'page-rewrite',
          week: 99,
          phase: 4,
          autopilotEligible: true,
        },
      ],
    },
  ],
  lost_keyword: (s) => [
    {
      hypothesis: 'Page may have lost relevance or backlinks',
      hypothesisType: 'lost_keyword:rebuild',
      proposedAction: `Refresh page for "${s.evidence.keyword}" with new internal links + content update`,
      generatedTasks: [
        { title: `Refresh page for "${s.evidence.keyword}"`, taskType: 'page-rewrite', week: 99, phase: 4, autopilotEligible: true },
        { title: `Add 3 internal links to "${s.evidence.keyword}" page`, taskType: 'internal-link-add', week: 99, phase: 4, autopilotEligible: true },
      ],
    },
  ],
  zero_impression_post: (s) => [
    {
      hypothesis: 'Post not indexed or wrong target keyword',
      hypothesisType: 'zero_impression:relaunch',
      proposedAction: `Verify indexing + reassess target keyword fit for "${s.evidence.title}"`,
      generatedTasks: [
        { title: `Re-submit "${s.evidence.title}" for indexing in GSC`, taskType: 'gsc-request-index', week: 99, phase: 4, autopilotEligible: false },
      ],
    },
  ],
  unindexed_page: (s) => [
    {
      hypothesis: 'Page not crawled — may have indexability issue',
      hypothesisType: 'unindexed:fix',
      proposedAction: `Audit crawler accessibility for ${s.evidence.url} + request indexing`,
      generatedTasks: [
        { title: `Crawler-sim audit for ${s.evidence.url}`, taskType: 'crawler-sim', week: 99, phase: 4, autopilotEligible: true },
        { title: `Request indexing for ${s.evidence.url}`, taskType: 'gsc-request-index', week: 99, phase: 4, autopilotEligible: false },
      ],
    },
  ],
  directory_silence: (s) => [
    {
      hypothesis: 'Submission lost in queue or rejected silently',
      hypothesisType: 'directory:reattempt',
      proposedAction: `Mark ${s.evidence.source} as lost + try alternative directory`,
      generatedTasks: [
        { title: `Mark ${s.evidence.source} as lost`, taskType: 'backlink-mark-lost', week: 99, phase: 4, autopilotEligible: true },
      ],
    },
  ],
  cwv_regression: (s) => [
    {
      hypothesis: 'CWV regression on tracked page',
      hypothesisType: 'cwv:fix',
      proposedAction: `Audit ${s.evidence.url} CWV (LCP=${s.evidence.lcp}, CLS=${s.evidence.cls})`,
      generatedTasks: [
        { title: `Audit ${s.evidence.url} CWV`, taskType: 'cwv-audit', week: 99, phase: 4, autopilotEligible: false },
      ],
    },
  ],
  keyword_misalignment: (s) => [
    {
      hypothesis: 'Page surfaces but query intent doesn\'t match',
      hypothesisType: 'misalignment:retarget',
      proposedAction: `Rewrite H1 + meta on ${s.evidence.url} to align with the actual ranking query`,
      generatedTasks: [
        { title: `Retarget ${s.evidence.url} to match query intent`, taskType: 'page-rewrite', week: 99, phase: 4, autopilotEligible: true },
      ],
    },
  ],
  pillar_orphan: (s) => [
    {
      hypothesis: 'Pillar lacks supporting cluster posts pointing inbound',
      hypothesisType: 'orphan:cluster',
      proposedAction: `Add inbound links to pillar "${s.evidence.title}" + plan supporting cluster`,
      generatedTasks: [
        { title: `Add inbound links to pillar "${s.evidence.title}"`, taskType: 'internal-link-add', week: 99, phase: 4, autopilotEligible: true },
      ],
    },
  ],
  compound_stagnation: () => [
    {
      hypothesis: 'Need fresh content infusion',
      hypothesisType: 'stagnation:refresh',
      proposedAction: 'Plan new pillar + 3 cluster posts',
      generatedTasks: [
        { title: 'Pick new keyword cluster theme', taskType: 'cluster-pick', week: 99, phase: 4, autopilotEligible: true },
      ],
    },
  ],
}

export function proposeHypotheses(
  signals: HealthSignal[],
  scoreboard?: Record<string, { wins: number; losses: number; noChange: number }>,
): HypothesisProposal[] {
  const out: HypothesisProposal[] = []
  for (const s of signals) {
    const fn = TEMPLATES[s.type]
    if (!fn) continue
    const candidates = fn(s)
    if (candidates.length === 0) continue
    // v1: pick first. v2: rank by past win rate
    let pick = candidates[0]
    if (scoreboard) {
      let bestScore = -Infinity
      for (const c of candidates) {
        const sb = scoreboard[c.hypothesisType]
        const total = (sb?.wins ?? 0) + (sb?.losses ?? 0) + (sb?.noChange ?? 0)
        const score = total > 0 ? (sb!.wins - sb!.losses) / total : 0
        if (score > bestScore) {
          bestScore = score
          pick = c
        }
      }
    }
    out.push(pick)
  }
  return out
}
