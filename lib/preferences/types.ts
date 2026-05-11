// lib/preferences/types.ts
//
// Contact email preferences (topics + frequency) and per-org preference
// config. The preferences gate (lib/preferences/store.ts#shouldSendToContact)
// is the SINGLE SOURCE OF TRUTH consulted by every send pipeline
// (broadcasts, sequences, transactional) before a message goes out.
//
// Storage:
//   - `org_preferences_config/{orgId}`  — one doc per org (per-org topics +
//     defaults + page copy).
//   - `contact_preferences/{contactId}` — one doc per contact recording
//     their topic opt-ins + chosen frequency.
//
// Transactional emails always bypass topic/frequency gating; that's enforced
// by special-casing `topicId === 'transactional'` (with `unsubscribeAllAt`
// still respected for hard global stops, but the API documents transactional
// as not turn-offable).

import type { Timestamp } from 'firebase-admin/firestore'

export interface SubscriptionTopic {
  /** Short stable id, e.g. "newsletter" */
  id: string
  /** Human label, e.g. "Weekly Newsletter" */
  label: string
  /** Shown in the preferences UI under the label */
  description: string
  /** New contacts default to this opt-in value */
  defaultOptIn: boolean
}

export type FrequencyChoice = 'all' | 'weekly' | 'monthly' | 'transactional-only' | 'none'

export interface ContactPreferences {
  contactId: string
  orgId: string
  /** topic.id -> opted-in? */
  topics: Record<string, boolean>
  /** Overall cap; 'none' === unsubscribed from all marketing. */
  frequency: FrequencyChoice
  /** Non-null if the user clicked "unsubscribe from all" — hard global stop. */
  unsubscribeAllAt: Timestamp | null
  updatedAt: Timestamp | null
  updatedFrom: 'preferences-page' | 'one-click' | 'admin' | 'webhook'
}

export interface OrgPreferencesConfig {
  orgId: string
  topics: SubscriptionTopic[]
  defaultFrequency: FrequencyChoice
  preferencesPageHeading: string
  preferencesPageSubheading: string
  /** Master toggle. When `false`, the gate behaves as if everyone is opted-in. */
  enabled: boolean
}

// ── Defaults ────────────────────────────────────────────────────────────────

export const DEFAULT_TOPICS: SubscriptionTopic[] = [
  {
    id: 'newsletter',
    label: 'Newsletter',
    description: 'Our regular newsletter with company updates and highlights.',
    defaultOptIn: true,
  },
  {
    id: 'product-updates',
    label: 'Product updates',
    description: 'Announcements about new features and improvements.',
    defaultOptIn: true,
  },
  {
    id: 'tips-and-stories',
    label: 'Tips & stories',
    description: 'Helpful tips, case studies, and customer stories.',
    defaultOptIn: true,
  },
  {
    id: 'transactional',
    label: 'Account & receipts',
    description: 'Important account notifications, receipts, and confirmations. Cannot be turned off.',
    defaultOptIn: true,
  },
]

export const DEFAULT_ORG_PREFERENCES_CONFIG: Omit<OrgPreferencesConfig, 'orgId'> = {
  topics: DEFAULT_TOPICS,
  defaultFrequency: 'all',
  preferencesPageHeading: 'Your email preferences',
  preferencesPageSubheading:
    "Choose what you'd like to hear about. You can update these anytime.",
  enabled: true,
}

export const FREQUENCY_CHOICES: FrequencyChoice[] = [
  'all',
  'weekly',
  'monthly',
  'transactional-only',
  'none',
]

export function buildDefaultContactPreferences(
  contactId: string,
  orgId: string,
  config: OrgPreferencesConfig,
): ContactPreferences {
  const topics: Record<string, boolean> = {}
  for (const t of config.topics) topics[t.id] = t.defaultOptIn
  return {
    contactId,
    orgId,
    topics,
    frequency: config.defaultFrequency,
    unsubscribeAllAt: null,
    updatedAt: null,
    updatedFrom: 'admin',
  }
}
