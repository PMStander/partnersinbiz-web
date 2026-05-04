import type { SeoSprint, SeoTask, SeoKeyword, SeoBacklink, SeoContent, SeoAudit, SeoOptimization, SprintStatus, AutopilotMode, TaskStatus, IntentBucket } from '@/lib/seo/types'

describe('seo/types', () => {
  it('SprintStatus accepts the documented states', () => {
    const states: SprintStatus[] = ['pre-launch', 'active', 'compounding', 'paused', 'archived']
    expect(states).toHaveLength(5)
  })

  it('AutopilotMode accepts off/safe/full', () => {
    const modes: AutopilotMode[] = ['off', 'safe', 'full']
    expect(modes).toHaveLength(3)
  })

  it('TaskStatus accepts all six lifecycle states', () => {
    const states: TaskStatus[] = ['not_started', 'in_progress', 'blocked', 'done', 'skipped', 'na']
    expect(states).toHaveLength(6)
  })

  it('IntentBucket accepts the three buckets', () => {
    const b: IntentBucket[] = ['problem', 'solution', 'brand']
    expect(b).toHaveLength(3)
  })

  it('SeoSprint has required fields', () => {
    const s: SeoSprint = {
      id: 's1', orgId: 'o1', clientId: 'c1',
      siteUrl: 'https://example.com', siteName: 'Example',
      startDate: new Date().toISOString(),
      currentDay: 1, currentWeek: 0, currentPhase: 0,
      status: 'pre-launch',
      templateId: 'outrank-90',
      autopilotMode: 'safe',
      autopilotTaskTypes: [],
      integrations: { gsc: { connected: false }, bing: { connected: false }, pagespeed: { enabled: false } },
      createdAt: new Date().toISOString(),
      createdBy: 'u1',
      createdByType: 'user',
      deleted: false,
    }
    expect(s.id).toBe('s1')
  })
})
