// lib/crm/predefined-segments.ts
//
// Curated recipes for common behavioral segments. Each preset is a fully-formed
// SegmentFilters payload — the UI can drop one straight into the rule builder
// or POST it to /api/v1/crm/segments to create a real segment.
//
// All presets stick to the platform-wide primitives (any-email scope, score
// ranges, etc.) so they work for every org without needing broadcast/campaign
// ids to be wired up.

import type { SegmentFilters } from './segments'

export interface PredefinedSegment {
  id: string
  name: string
  description: string
  /** A short reason-to-use blurb shown under the name. */
  useCase: string
  filters: SegmentFilters
}

export const PREDEFINED_SEGMENTS: PredefinedSegment[] = [
  {
    id: 'highly-engaged',
    name: 'Highly engaged',
    description: 'Opened 3+ emails in the last 30 days and clicked at least one link.',
    useCase: 'Best for: VIP offers, product launches, paid upgrade nudges.',
    filters: {
      behavioral: [
        { op: 'has-opened', scope: 'any-email', withinDays: 30 },
        { op: 'has-clicked', scope: 'any-email', withinDays: 30 },
      ],
      engagement: { min: 60, lastEngagedWithinDays: 30 },
    },
  },
  {
    id: 'cooling',
    name: 'Cooling',
    description: 'Engaged between 30 and 90 days ago — no opens or clicks since.',
    useCase: 'Best for: re-engagement campaigns, win-back offers.',
    filters: {
      behavioral: [
        { op: 'has-not-opened', scope: 'any-email', withinDays: 30 },
        { op: 'has-not-clicked', scope: 'any-email', withinDays: 30 },
      ],
      engagement: { lastEngagedWithinDays: 90, notEngagedWithinDays: 30 },
    },
  },
  {
    id: 'dormant',
    name: 'Dormant',
    description: 'No opens or clicks in the last 90 days.',
    useCase: 'Best for: final-chance emails before list pruning, sunset flows.',
    filters: {
      behavioral: [
        { op: 'has-not-opened', scope: 'any-email', withinDays: 90 },
        { op: 'has-not-clicked', scope: 'any-email', withinDays: 90 },
      ],
      engagement: { notEngagedWithinDays: 90, max: 30 },
    },
  },
  {
    id: 'new-and-active',
    name: 'New & active',
    description: 'Captured in the last 14 days and opened a welcome email.',
    useCase: 'Best for: onboarding nudges, second-touch sequences.',
    filters: {
      // createdAfter is set at runtime by the UI (rolling window). We leave it
      // null here so the consumer can recompute when applying the template.
      behavioral: [{ op: 'has-opened', scope: 'any-email', withinDays: 14 }],
    },
  },
  {
    id: 'never-engaged',
    name: 'Never engaged',
    description: 'Received 3+ emails but has never opened a single one.',
    useCase: 'Best for: subject-line A/B tests, alternate channel outreach.',
    filters: {
      behavioral: [
        { op: 'has-received', scope: 'any-email' },
        { op: 'has-not-opened', scope: 'any-email' },
      ],
    },
  },
  {
    id: 'clicked-no-reply',
    name: 'Clicked but didn\'t reply',
    description: 'Clicked any link but has never replied to one of our emails.',
    useCase: 'Best for: sales follow-ups, "we noticed you visited" prompts.',
    filters: {
      behavioral: [
        { op: 'has-clicked', scope: 'any-email', withinDays: 60 },
        { op: 'has-not-replied', scope: 'any-email' },
      ],
    },
  },
  {
    id: 'newsletter-only',
    name: 'Newsletter-only',
    description: 'Opened the newsletter topic but never opened product updates.',
    useCase: 'Best for: dedicated newsletter sponsorships, content-only sends.',
    filters: {
      behavioral: [
        { op: 'has-opened', scope: 'topic', scopeId: 'newsletter' },
        { op: 'has-not-opened', scope: 'topic', scopeId: 'product-update' },
      ],
    },
  },
]

/**
 * Resolve a preset by id, returning a deep-cloned copy so the caller can
 * mutate without affecting the canonical recipe.
 */
export function getPredefinedSegment(id: string): PredefinedSegment | null {
  const found = PREDEFINED_SEGMENTS.find((p) => p.id === id)
  if (!found) return null
  return JSON.parse(JSON.stringify(found)) as PredefinedSegment
}
