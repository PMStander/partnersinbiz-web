// lib/crm/integrations/handlers/mailchimp.ts
//
// Mailchimp v3.0 list-member sync. API key auth (no OAuth).
//
// API key format: `<32-hex>-<dc>` (e.g. `test-api-key-example-us21`).
// The data-center suffix is the API host: https://us21.api.mailchimp.com.
//
// Fetches subscribed members from the configured list and creates / merges
// CRM contacts in batches of 1000 (Mailchimp's max page size). Auto-tags
// from the integration apply on every import; auto-campaigns enroll only
// brand-new contacts (so re-runs don't double-enroll existing members).
//
// Out of scope for v1:
//   - Mailchimp interest groups → contact tags mapping
//   - Bidirectional sync (we only pull)
//   - Soft bounces / cleaned status (we treat 'subscribed' only)

import { adminDb } from '@/lib/firebase/admin'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import type {
  CrmIntegration,
  CrmIntegrationSyncStats,
} from '../types'
import { EMPTY_SYNC_STATS } from '../types'
import type { Campaign } from '@/lib/campaigns/types'
import type { Sequence } from '@/lib/sequences/types'

interface MailchimpMember {
  id: string
  email_address: string
  status: 'subscribed' | 'unsubscribed' | 'cleaned' | 'pending' | 'transactional'
  merge_fields?: Record<string, unknown>
  tags?: Array<{ id: number; name: string }>
  interests?: Record<string, boolean>
}

interface MailchimpListMembersResponse {
  members: MailchimpMember[]
  total_items: number
}

interface MailchimpInterestCategory {
  id: string
  title: string
}

interface MailchimpInterest {
  id: string
  name: string
}

// Fetches all interest categories and their interests for a list.
// Returns a Map<interestId, interestName> or an empty map on failure.
async function fetchInterestMap(
  dc: string,
  listId: string,
  auth: string,
): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  try {
    const catRes = await fetch(
      `https://${dc}.api.mailchimp.com/3.0/lists/${encodeURIComponent(listId)}/interest-categories`,
      { headers: { Authorization: auth } },
    )
    if (!catRes.ok) {
      console.warn(`[mailchimp-sync] interest-categories fetch failed (${catRes.status}) — continuing without interests`)
      return map
    }
    const catData = await catRes.json() as { categories: MailchimpInterestCategory[] }
    const categories = catData.categories ?? []

    await Promise.all(
      categories.map(async (cat) => {
        try {
          const intRes = await fetch(
            `https://${dc}.api.mailchimp.com/3.0/lists/${encodeURIComponent(listId)}/interest-categories/${cat.id}/interests`,
            { headers: { Authorization: auth } },
          )
          if (!intRes.ok) {
            console.warn(`[mailchimp-sync] interests fetch for category ${cat.id} failed (${intRes.status})`)
            return
          }
          const intData = await intRes.json() as { interests: MailchimpInterest[] }
          for (const interest of intData.interests ?? []) {
            map.set(interest.id, interest.name)
          }
        } catch (err) {
          console.warn('[mailchimp-sync] interests fetch error', cat.id, err)
        }
      }),
    )
  } catch (err) {
    console.warn('[mailchimp-sync] interest-categories fetch error — continuing without interests', err)
  }
  return map
}

const PAGE_SIZE = 1000
const MAX_PAGES = 50  // safety cap → max 50k members per sync

export type MailchimpSyncResult =
  | { ok: true; stats: CrmIntegrationSyncStats }
  | { ok: false; error: string; stats: CrmIntegrationSyncStats }

export async function syncMailchimp(integration: CrmIntegration): Promise<MailchimpSyncResult> {
  const apiKey = integration.config.apiKey ?? ''
  const listId = integration.config.listId ?? ''
  const stats: CrmIntegrationSyncStats = { ...EMPTY_SYNC_STATS }

  if (!apiKey || !listId) {
    return { ok: false, error: 'Missing apiKey or listId', stats }
  }

  // Extract data-center from API key
  const dcMatch = apiKey.match(/-([a-z0-9]+)$/)
  if (!dcMatch) {
    return { ok: false, error: 'Invalid API key format — expected <hex>-<dc>', stats }
  }
  const dc = dcMatch[1]

  const auth = 'Basic ' + Buffer.from(`anystring:${apiKey}`).toString('base64')
  const baseUrl = `https://${dc}.api.mailchimp.com/3.0/lists/${encodeURIComponent(listId)}/members`

  // Fetch interest groups once before pagination — used to map member.interests → tags
  const interestMap = await fetchInterestMap(dc, listId, auth)

  // Page through subscribed members
  let offset = 0
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = `${baseUrl}?status=subscribed&count=${PAGE_SIZE}&offset=${offset}&fields=members.id,members.email_address,members.status,members.merge_fields,members.tags,total_items`
    let pageData: MailchimpListMembersResponse
    try {
      const res = await fetch(url, { headers: { Authorization: auth } })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        return { ok: false, error: `Mailchimp ${res.status}: ${body.slice(0, 200)}`, stats }
      }
      pageData = await res.json() as MailchimpListMembersResponse
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Network error', stats }
    }

    const members = pageData.members ?? []
    if (members.length === 0) break

    for (const m of members) {
      const email = (m.email_address ?? '').trim().toLowerCase()
      if (!email) {
        stats.skipped++
        continue
      }
      stats.imported++

      try {
        const result = await upsertContact(integration, m, email, interestMap)
        if (result === 'created') stats.created++
        else if (result === 'updated') stats.updated++
        else stats.skipped++
      } catch (err) {
        console.error('[mailchimp-sync] upsert failed', email, err)
        stats.errored++
      }
    }

    if (members.length < PAGE_SIZE) break
    offset += members.length
  }

  return { ok: true, stats }
}

async function upsertContact(
  integration: CrmIntegration,
  member: MailchimpMember,
  email: string,
  interestMap: Map<string, string> = new Map(),
): Promise<'created' | 'updated' | 'skipped'> {
  // Find existing contact by (orgId, email)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existingSnap = await (adminDb.collection('contacts') as any)
    .where('orgId', '==', integration.orgId)
    .where('email', '==', email)
    .limit(1)
    .get()

  // Build name + merge tags
  const merge = (member.merge_fields ?? {}) as Record<string, unknown>
  const firstName = String(merge.FNAME ?? '')
  const lastName = String(merge.LNAME ?? '')
  const fullName = [firstName, lastName].filter(Boolean).join(' ') || email
  const company = String(merge.COMPANY ?? merge.MMERGE3 ?? '')

  // Mailchimp tags + interest groups + integration auto-tags
  const sourceTagNames = (member.tags ?? []).map((t) => t.name).filter(Boolean)
  const interestTagNames: string[] = []
  for (const [interestId, enabled] of Object.entries(member.interests ?? {})) {
    if (enabled) {
      const name = interestMap.get(interestId)
      if (name) interestTagNames.push(`mc:${name}`)
    }
  }
  const tags = Array.from(new Set([...integration.autoTags, ...sourceTagNames, ...interestTagNames]))

  if (!existingSnap.empty) {
    const doc = existingSnap.docs[0]
    const existing = doc.data() as { tags?: string[]; bouncedAt?: unknown; unsubscribedAt?: unknown }

    // Hard-blocked contacts are left as-is (we won't re-subscribe via sync)
    if (existing.bouncedAt || existing.unsubscribedAt) return 'skipped'

    const merged = Array.from(new Set([...(existing.tags ?? []), ...tags]))
    const tagsChanged = merged.length !== (existing.tags?.length ?? 0)
    if (!tagsChanged) return 'skipped'

    await doc.ref.update({
      tags: merged,
      lastContactedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
    return 'updated'
  }

  // New contact
  const docRef = await adminDb.collection('contacts').add({
    orgId: integration.orgId,
    capturedFromId: '',                     // integrations aren't a CaptureSource
    name: fullName,
    email,
    phone: '',
    company,
    website: '',
    source: 'import',
    type: 'lead',
    stage: 'new',
    tags,
    notes: `Imported from Mailchimp (member id ${member.id})`,
    assignedTo: '',
    deleted: false,
    subscribedAt: FieldValue.serverTimestamp(),
    unsubscribedAt: null,
    bouncedAt: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    lastContactedAt: null,
  })

  // Activity log
  try {
    await adminDb.collection('activities').add({
      orgId: integration.orgId,
      contactId: docRef.id,
      type: 'note',
      summary: `Imported from Mailchimp (${integration.name})`,
      metadata: { integrationId: integration.id, provider: 'mailchimp', mailchimpMemberId: member.id },
      createdBy: 'integration-sync',
      createdAt: FieldValue.serverTimestamp(),
    })
  } catch (err) {
    console.error('[mailchimp-sync] activity log failed', err)
  }

  // Auto-enroll into matching active campaigns (only brand-new contacts)
  for (const campaignId of integration.autoCampaignIds ?? []) {
    try {
      const campSnap = await adminDb.collection('campaigns').doc(campaignId).get()
      if (!campSnap.exists) continue
      const campaign = campSnap.data() as Campaign
      if (campaign.deleted || campaign.status !== 'active') continue
      if (campaign.orgId !== integration.orgId) continue

      const seqSnap = await adminDb.collection('sequences').doc(campaign.sequenceId).get()
      if (!seqSnap.exists) continue
      const sequence = seqSnap.data() as Sequence
      if (!sequence.steps?.length) continue

      const firstStep = sequence.steps[0]
      const delayMs = (firstStep.delayDays ?? 0) * 24 * 60 * 60 * 1000
      const nextSendAt = Timestamp.fromDate(new Date(Date.now() + delayMs))

      await adminDb.collection('sequence_enrollments').add({
        orgId: integration.orgId,
        campaignId,
        sequenceId: campaign.sequenceId,
        contactId: docRef.id,
        status: 'active',
        currentStep: 0,
        enrolledAt: FieldValue.serverTimestamp(),
        nextSendAt,
        deleted: false,
      })

      await campSnap.ref.update({
        'stats.enrolled': FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      })
    } catch (err) {
      console.error('[mailchimp-sync] auto-enroll failed', { campaignId }, err)
    }
  }

  return 'created'
}
