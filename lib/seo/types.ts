import type { Timestamp } from 'firebase-admin/firestore'

export type SprintStatus = 'pre-launch' | 'active' | 'compounding' | 'paused' | 'archived'
export type AutopilotMode = 'off' | 'safe' | 'full'
export type TaskStatus = 'not_started' | 'in_progress' | 'blocked' | 'done' | 'skipped' | 'na'
export type TaskSource = 'template' | 'manual' | 'optimization'
export type IntentBucket = 'problem' | 'solution' | 'brand'
export type KeywordStatus = 'not_yet' | 'in_progress' | 'ranking' | 'top_10' | 'top_3' | 'lost'
export type BacklinkType = 'directory' | 'community' | 'guest_post' | 'link_trade' | 'organic'
export type BacklinkStatus = 'not_started' | 'submitted' | 'live' | 'rejected' | 'lost'
export type ContentType = 'comparison' | 'use-case' | 'pillar' | 'cluster' | 'how-to' | 'alternative'
export type ContentStatus = 'idea' | 'drafting' | 'review' | 'scheduled' | 'live'
export type OptimizationStatus = 'proposed' | 'approved' | 'in_progress' | 'applied' | 'rejected' | 'measured'
export type OptimizationResult = 'win' | 'no-change' | 'loss'
export type SignalType =
  | 'stuck_page' | 'lost_keyword' | 'zero_impression_post' | 'unindexed_page'
  | 'directory_silence' | 'cwv_regression' | 'keyword_misalignment'
  | 'pillar_orphan' | 'compound_stagnation'

export interface IntegrationGsc { connected: boolean; propertyUrl?: string; lastPullAt?: string; scopes?: string[]; tokenStatus?: 'valid' | 'expired' | 'revoked' }
export interface IntegrationBing { connected: boolean; siteUrl?: string; lastPullAt?: string; tokenStatus?: 'valid' | 'expired' | 'revoked' }
export interface IntegrationPagespeed { enabled: boolean; lastPullAt?: string }

export interface TodayPlan {
  asOf: string
  currentDay: number
  currentWeek: number
  due: string[]
  inProgress: string[]
  blocked: { taskId: string; reason: string }[]
  optimizationProposals: string[]
}

export interface HealthSignal {
  type: SignalType
  severity: 'low' | 'medium' | 'high'
  evidence: Record<string, unknown>
}

export interface SeoSprint {
  id: string
  orgId: string
  clientId: string
  siteUrl: string
  siteName: string
  startDate: string
  currentDay: number
  currentWeek: number
  currentPhase: 0 | 1 | 2 | 3 | 4
  status: SprintStatus
  templateId: string
  autopilotMode: AutopilotMode
  autopilotTaskTypes: string[]
  integrations: { gsc: IntegrationGsc; bing: IntegrationBing; pagespeed: IntegrationPagespeed }
  todayPlan?: TodayPlan
  health?: { score: number; signals: HealthSignal[] }
  scoreboard?: Record<string, { wins: number; losses: number; noChange: number }>
  createdAt: string | Timestamp
  createdBy: string
  createdByType: 'user' | 'agent' | 'system'
  updatedAt?: string | Timestamp
  updatedBy?: string
  updatedByType?: 'user' | 'agent' | 'system'
  deleted: boolean
  deletedAt?: string | Timestamp
}

export interface SeoTask {
  id: string
  sprintId: string
  orgId: string
  week: number
  phase: 0 | 1 | 2 | 3 | 4
  focus: string
  title: string
  description?: string
  internalToolUrl?: string
  externalReferenceUrl?: string
  status: TaskStatus
  source: TaskSource
  parentOptimizationId?: string
  taskType: string
  autopilotEligible: boolean
  assignee?: { type: 'user' | 'agent'; id: string }
  outputArtifactId?: string
  blockerReason?: string
  dueAt?: string
  completedAt?: string
  completedBy?: string
  createdAt: string | Timestamp
  createdBy: string
  createdByType: 'user' | 'agent' | 'system'
  deleted: boolean
}

export interface KeywordPosition {
  pulledAt: string
  position: number
  source: 'gsc' | 'manual'
  impressions?: number
  clicks?: number
  ctr?: number
}

export interface SeoKeyword {
  id: string
  sprintId: string
  orgId: string
  keyword: string
  volume?: number
  topThreeDR?: number
  intentBucket: IntentBucket
  targetPageUrl?: string
  positions: KeywordPosition[]
  currentPosition?: number
  currentImpressions?: number
  currentClicks?: number
  currentCtr?: number
  status: KeywordStatus
  retiredAt?: string
  createdAt: string | Timestamp
  deleted: boolean
}

export interface SeoBacklink {
  id: string
  sprintId: string
  orgId: string
  source: string
  domain: string
  type: BacklinkType
  theirDR?: number
  status: BacklinkStatus
  submittedAt?: string
  liveAt?: string
  url?: string
  notes?: string
  linkedSocialPostId?: string
  discoveredVia: 'manual' | 'bing-wmt' | 'common-crawl' | 'gsc-links'
  createdAt: string | Timestamp
  deleted: boolean
}

export interface SeoContent {
  id: string
  sprintId: string
  orgId: string
  publishDate?: string
  title: string
  type: ContentType
  targetKeywordId?: string
  targetUrl?: string
  status: ContentStatus
  draftPostId?: string
  liUrl?: string
  xUrl?: string
  internalLinksAdded: boolean
  performance?: { impressions?: number; clicks?: number; position?: number; lastPulledAt?: string }
  createdAt: string | Timestamp
  deleted: boolean
}

export interface SeoAudit {
  id: string
  sprintId: string
  orgId: string
  snapshotDay: number
  capturedAt: string
  traffic: { impressions: number; clicks: number; ctr: number; avgPosition: number }
  rankings: { top100: number; top10: number; top3: number }
  authority: { dr?: number; referringDomains: number; totalBacklinks: number }
  content: { pagesIndexed: number; postsPublished: number; comparisonPagesLive: number }
  source: 'gsc' | 'manual' | 'mixed'
  publicShareToken?: string
  pdfUrl?: string
  deleted: boolean
}

export interface SeoOptimization {
  id: string
  sprintId: string
  orgId: string
  detectedAt: string
  signal: HealthSignal
  hypothesis: string
  hypothesisType: string
  proposedAction: string
  generatedTaskIds: string[]
  status: OptimizationStatus
  outcomeMeasureScheduledFor?: string
  baselineSnapshot?: Record<string, unknown>
  outcomeMeasuredAt?: string
  outcomeDelta?: { positionChange?: number; impressionsChange?: number; clicksChange?: number }
  result?: OptimizationResult
  notes?: string
  deleted: boolean
}
