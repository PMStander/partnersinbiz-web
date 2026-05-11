// lib/preferences/store.ts
//
// CRUD + gate for contact email preferences and org preference config.
//
// `shouldSendToContact` is the SINGLE SOURCE OF TRUTH consulted by every
// send pipeline (broadcasts, sequences, /api/v1/email/send) before a
// message is dispatched.
//
// Transactional emails (`topicId === 'transactional'`) bypass topic/frequency
// gating BUT still respect a contact's hard `unsubscribedAt` (legacy field —
// kept consistent with the unsubscribe route). This matches the spec:
// "transactional opts cannot be turned off".
//
// Collections:
//   - org_preferences_config/{orgId}
//   - contact_preferences/{contactId}

import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import {
  buildDefaultContactPreferences,
  DEFAULT_ORG_PREFERENCES_CONFIG,
  DEFAULT_TOPICS,
  FREQUENCY_CHOICES,
  type ContactPreferences,
  type FrequencyChoice,
  type OrgPreferencesConfig,
  type SubscriptionTopic,
} from './types'

const ORG_CFG_COLL = 'org_preferences_config'
const CONTACT_PREFS_COLL = 'contact_preferences'

// ── Org config ──────────────────────────────────────────────────────────────

export async function getOrgPreferencesConfig(orgId: string): Promise<OrgPreferencesConfig> {
  if (!orgId) throw new Error('orgId is required')
  const snap = await adminDb.collection(ORG_CFG_COLL).doc(orgId).get()
  if (!snap.exists) {
    return { orgId, ...DEFAULT_ORG_PREFERENCES_CONFIG }
  }
  const data = snap.data() ?? {}
  return {
    orgId,
    topics: Array.isArray(data.topics) && data.topics.length > 0
      ? (data.topics as SubscriptionTopic[])
      : DEFAULT_TOPICS,
    defaultFrequency: FREQUENCY_CHOICES.includes(data.defaultFrequency)
      ? (data.defaultFrequency as FrequencyChoice)
      : DEFAULT_ORG_PREFERENCES_CONFIG.defaultFrequency,
    preferencesPageHeading:
      typeof data.preferencesPageHeading === 'string' && data.preferencesPageHeading
        ? data.preferencesPageHeading
        : DEFAULT_ORG_PREFERENCES_CONFIG.preferencesPageHeading,
    preferencesPageSubheading:
      typeof data.preferencesPageSubheading === 'string'
        ? data.preferencesPageSubheading
        : DEFAULT_ORG_PREFERENCES_CONFIG.preferencesPageSubheading,
    enabled: data.enabled !== false,
  }
}

export async function setOrgPreferencesConfig(
  orgId: string,
  patch: Partial<Omit<OrgPreferencesConfig, 'orgId'>>,
): Promise<OrgPreferencesConfig> {
  if (!orgId) throw new Error('orgId is required')
  const current = await getOrgPreferencesConfig(orgId)

  const next: OrgPreferencesConfig = {
    orgId,
    topics: Array.isArray(patch.topics) ? sanitizeTopics(patch.topics) : current.topics,
    defaultFrequency: patch.defaultFrequency && FREQUENCY_CHOICES.includes(patch.defaultFrequency)
      ? patch.defaultFrequency
      : current.defaultFrequency,
    preferencesPageHeading:
      typeof patch.preferencesPageHeading === 'string'
        ? patch.preferencesPageHeading
        : current.preferencesPageHeading,
    preferencesPageSubheading:
      typeof patch.preferencesPageSubheading === 'string'
        ? patch.preferencesPageSubheading
        : current.preferencesPageSubheading,
    enabled: typeof patch.enabled === 'boolean' ? patch.enabled : current.enabled,
  }

  await adminDb.collection(ORG_CFG_COLL).doc(orgId).set(
    {
      orgId: next.orgId,
      topics: next.topics,
      defaultFrequency: next.defaultFrequency,
      preferencesPageHeading: next.preferencesPageHeading,
      preferencesPageSubheading: next.preferencesPageSubheading,
      enabled: next.enabled,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  )

  return next
}

function sanitizeTopics(topics: SubscriptionTopic[]): SubscriptionTopic[] {
  const seen = new Set<string>()
  const out: SubscriptionTopic[] = []
  for (const raw of topics) {
    if (!raw || typeof raw !== 'object') continue
    const id = String(raw.id ?? '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-')
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push({
      id,
      label: String(raw.label ?? id).trim() || id,
      description: String(raw.description ?? '').trim(),
      defaultOptIn: raw.defaultOptIn !== false,
    })
  }
  return out.length > 0 ? out : DEFAULT_TOPICS
}

// ── Contact prefs ───────────────────────────────────────────────────────────

export async function getContactPreferences(
  contactId: string,
  orgId?: string,
): Promise<ContactPreferences> {
  if (!contactId) throw new Error('contactId is required')
  const snap = await adminDb.collection(CONTACT_PREFS_COLL).doc(contactId).get()
  if (snap.exists) {
    const data = snap.data() ?? {}
    return {
      contactId,
      orgId: typeof data.orgId === 'string' ? data.orgId : orgId ?? '',
      topics:
        data.topics && typeof data.topics === 'object'
          ? (data.topics as Record<string, boolean>)
          : {},
      frequency: FREQUENCY_CHOICES.includes(data.frequency)
        ? (data.frequency as FrequencyChoice)
        : 'all',
      unsubscribeAllAt: (data.unsubscribeAllAt as Timestamp | null) ?? null,
      updatedAt: (data.updatedAt as Timestamp | null) ?? null,
      updatedFrom: data.updatedFrom ?? 'admin',
    }
  }

  // No doc yet — build defaults from the org config (if we know the org).
  if (!orgId) {
    return {
      contactId,
      orgId: '',
      topics: {},
      frequency: 'all',
      unsubscribeAllAt: null,
      updatedAt: null,
      updatedFrom: 'admin',
    }
  }
  const cfg = await getOrgPreferencesConfig(orgId)
  return buildDefaultContactPreferences(contactId, orgId, cfg)
}

export interface SetContactPreferencesInput {
  contactId: string
  orgId: string
  topics?: Record<string, boolean>
  frequency?: FrequencyChoice
  unsubscribeAll?: boolean
  updatedFrom: ContactPreferences['updatedFrom']
}

export async function setContactPreferences(
  input: SetContactPreferencesInput,
): Promise<ContactPreferences> {
  const { contactId, orgId, updatedFrom } = input
  if (!contactId) throw new Error('contactId is required')
  if (!orgId) throw new Error('orgId is required')

  const current = await getContactPreferences(contactId, orgId)

  const next: ContactPreferences = {
    contactId,
    orgId,
    topics: input.topics ? sanitizeTopicMap(input.topics) : current.topics,
    frequency:
      input.frequency && FREQUENCY_CHOICES.includes(input.frequency)
        ? input.frequency
        : current.frequency,
    unsubscribeAllAt: input.unsubscribeAll
      ? Timestamp.now()
      : input.unsubscribeAll === false
        ? null
        : current.unsubscribeAllAt,
    updatedAt: null,
    updatedFrom,
  }

  await adminDb.collection(CONTACT_PREFS_COLL).doc(contactId).set(
    {
      contactId,
      orgId,
      topics: next.topics,
      frequency: next.frequency,
      unsubscribeAllAt: next.unsubscribeAllAt,
      updatedAt: FieldValue.serverTimestamp(),
      updatedFrom: next.updatedFrom,
    },
    { merge: true },
  )

  return next
}

function sanitizeTopicMap(m: Record<string, boolean>): Record<string, boolean> {
  const out: Record<string, boolean> = {}
  for (const [k, v] of Object.entries(m ?? {})) {
    if (typeof k !== 'string' || !k) continue
    out[k] = v === true
  }
  return out
}

// ── Gate ────────────────────────────────────────────────────────────────────

export type SendChannel = 'email' | 'sms'

export interface ShouldSendArgs {
  contactId: string
  orgId: string
  topicId?: string
  /**
   * Which channel we're about to send on. Defaults to 'email' for
   * backwards-compat with existing callers. SMS adds an extra check against
   * the contact's `smsUnsubscribedAt` (set when a STOP reply is processed).
   */
  channel?: SendChannel
}

export interface ShouldSendResult {
  allowed: boolean
  reason?: string
}

const TRANSACTIONAL = 'transactional'

/**
 * Central gate. Every send pipeline calls this BEFORE dispatching.
 *
 * Rules:
 *   - If contact is hard-unsubscribed (legacy `unsubscribedAt` on the contact
 *     doc, or `unsubscribeAllAt` on prefs), always block — even transactional
 *     respects an explicit "stop everything". Marketing topics always blocked.
 *   - For SMS: contact must additionally not be `smsUnsubscribedAt`-marked
 *     (set on a STOP reply via the Twilio inbound webhook).
 *   - Transactional bypasses topic + frequency checks (subject to the
 *     hard stop above).
 *   - If org config is disabled (master toggle off), allow.
 *   - Otherwise: topic must be opted-in, and `frequency !== 'none'` (and
 *     `'transactional-only'` only allows the transactional topic).
 */
export async function shouldSendToContact(args: ShouldSendArgs): Promise<ShouldSendResult> {
  const { contactId, orgId } = args
  const topicId = (args.topicId ?? 'newsletter').toLowerCase()
  const channel: SendChannel = args.channel ?? 'email'

  if (!contactId || !orgId) {
    return { allowed: false, reason: 'missing contactId or orgId' }
  }

  // Legacy: contact doc-level unsubscribedAt is a hard stop for all marketing.
  let legacyHardStop = false
  let legacyBounced = false
  let smsHardStop = false
  let hasPhone = false
  try {
    const cSnap = await adminDb.collection('contacts').doc(contactId).get()
    if (cSnap.exists) {
      const cd = cSnap.data() ?? {}
      legacyHardStop = !!cd.unsubscribed || !!cd.unsubscribedAt
      legacyBounced = !!cd.bouncedAt
      smsHardStop = !!cd.smsUnsubscribedAt
      hasPhone = typeof cd.phone === 'string' && cd.phone.trim().length > 0
    }
  } catch {
    // Non-fatal — fall through.
  }

  if (channel === 'sms') {
    if (!hasPhone) {
      return { allowed: false, reason: 'contact has no phone number' }
    }
    if (smsHardStop) {
      return { allowed: false, reason: 'contact replied STOP (sms-unsubscribed)' }
    }
  } else {
    if (legacyBounced) {
      return { allowed: false, reason: 'contact bounced previously' }
    }
  }

  if (topicId === TRANSACTIONAL) {
    if (legacyHardStop) {
      return { allowed: false, reason: 'contact has hard-unsubscribed (global stop)' }
    }
    // Transactional bypasses topic + frequency.
    return { allowed: true }
  }

  if (legacyHardStop) {
    return { allowed: false, reason: 'contact unsubscribed' }
  }

  const cfg = await getOrgPreferencesConfig(orgId)
  if (!cfg.enabled) {
    // Master toggle off — preferences not enforced. Allow.
    return { allowed: true }
  }

  const prefs = await getContactPreferences(contactId, orgId)

  if (prefs.unsubscribeAllAt) {
    return { allowed: false, reason: 'contact opted out of all email' }
  }

  if (prefs.frequency === 'none') {
    return { allowed: false, reason: 'frequency=none (unsubscribed)' }
  }

  if (prefs.frequency === 'transactional-only') {
    return { allowed: false, reason: 'contact opted into transactional only' }
  }

  // Default opt-in fallback: if a topic isn't in the contact's map, fall back
  // to the org config's defaultOptIn for that topic. New contacts therefore
  // inherit the org's defaults without needing a write.
  let optedIn = prefs.topics[topicId]
  if (typeof optedIn !== 'boolean') {
    const t = cfg.topics.find((x) => x.id === topicId)
    optedIn = t ? t.defaultOptIn : true
  }
  if (!optedIn) {
    return { allowed: false, reason: `opted out of topic '${topicId}'` }
  }

  return { allowed: true }
}

/**
 * Build a preferences URL for a contact, signed with the existing unsubscribe
 * token. Renderers + send pipelines use this when the EmailDocument footer
 * (or send-time vars) doesn't already supply one.
 */
export function buildPreferencesUrl(contactId: string, signToken: (id: string) => string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_BASE_URL ?? '').replace(
    /\/$/,
    '',
  )
  return `${base}/preferences/${encodeURIComponent(signToken(contactId))}`
}
