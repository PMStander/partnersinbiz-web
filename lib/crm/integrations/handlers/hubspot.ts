// lib/crm/integrations/handlers/hubspot.ts
//
// HubSpot Private App token sync. No OAuth flow — user pastes a token from
// HubSpot → Settings → Integrations → Private Apps.
//
// Fetches all contacts using the CRM search endpoint (POST) and creates /
// merges CRM contacts. Auto-tags from the integration apply on every import;
// auto-campaigns enroll only brand-new contacts.
//
// Out of scope for v1:
//   - Lifecycle-stage → contact-stage mapping (stored as a tag only)
//   - Bidirectional sync (we only pull)
//   - Delta/incremental sync (no last-modified filter)

import { adminDb } from '@/lib/firebase/admin'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import type {
  CrmIntegration,
  CrmIntegrationSyncStats,
} from '../types'
import { EMPTY_SYNC_STATS } from '../types'
import type { Campaign } from '@/lib/campaigns/types'
import type { Sequence } from '@/lib/sequences/types'

interface HubspotContactProperties {
  email?: string
  firstname?: string
  lastname?: string
  company?: string
  phone?: string
  lifecyclestage?: string
}

interface HubspotContact {
  id: string
  properties: HubspotContactProperties
}

interface HubspotSearchResponse {
  results: HubspotContact[]
  paging?: {
    next?: {
      after?: string
    }
  }
}

const PAGE_SIZE = 100
const MAX_PAGES = 500  // safety cap → max 50k contacts per sync

const SEARCH_URL = 'https://api.hubapi.com/crm/v3/objects/contacts/search'
const CONTACT_PROPERTIES = ['email', 'firstname', 'lastname', 'company', 'phone', 'lifecyclestage']

export type HubspotSyncResult =
  | { ok: true; stats: CrmIntegrationSyncStats }
  | { ok: false; error: string; stats: CrmIntegrationSyncStats }

export async function syncHubspot(integration: CrmIntegration): Promise<HubspotSyncResult> {
  const accessToken = integration.config.accessToken ?? ''
  const stats: CrmIntegrationSyncStats = { ...EMPTY_SYNC_STATS }

  if (!accessToken) {
    return { ok: false, error: 'Missing accessToken', stats }
  }

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  }

  let cursor: string | undefined
  for (let page = 0; page < MAX_PAGES; page++) {
    const body: Record<string, unknown> = {
      filterGroups: [],
      properties: CONTACT_PROPERTIES,
      limit: PAGE_SIZE,
    }
    if (cursor) body.after = cursor

    let pageData: HubspotSearchResponse
    try {
      const res = await fetch(SEARCH_URL, { method: 'POST', headers, body: JSON.stringify(body) })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        return { ok: false, error: `HubSpot ${res.status}: ${text.slice(0, 200)}`, stats }
      }
      pageData = await res.json() as HubspotSearchResponse
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Network error', stats }
    }

    const results = pageData.results ?? []
    if (results.length === 0) break

    for (const contact of results) {
      const email = (contact.properties.email ?? '').trim().toLowerCase()
      if (!email) {
        stats.skipped++
        continue
      }
      stats.imported++

      try {
        const result = await upsertContact(integration, contact, email)
        if (result === 'created') stats.created++
        else if (result === 'updated') stats.updated++
        else stats.skipped++
      } catch (err) {
        console.error('[hubspot-sync] upsert failed', email, err)
        stats.errored++
      }
    }

    cursor = pageData.paging?.next?.after
    if (!cursor) break
  }

  return { ok: true, stats }
}

async function upsertContact(
  integration: CrmIntegration,
  contact: HubspotContact,
  email: string,
): Promise<'created' | 'updated' | 'skipped'> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existingSnap = await (adminDb.collection('contacts') as any)
    .where('orgId', '==', integration.orgId)
    .where('email', '==', email)
    .limit(1)
    .get()

  const props = contact.properties
  const firstName = props.firstname ?? ''
  const lastName = props.lastname ?? ''
  const fullName = [firstName, lastName].filter(Boolean).join(' ') || email
  const company = props.company ?? ''
  const phone = props.phone ?? ''

  // Lifecycle stage becomes a tag if set (e.g. "lead", "customer", "subscriber")
  const sourceTags = props.lifecyclestage ? [props.lifecyclestage] : []
  const tags = Array.from(new Set([...integration.autoTags, ...sourceTags]))

  if (!existingSnap.empty) {
    const doc = existingSnap.docs[0]
    const existing = doc.data() as { tags?: string[]; bouncedAt?: unknown; unsubscribedAt?: unknown }

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
    capturedFromId: '',
    name: fullName,
    email,
    phone,
    company,
    website: '',
    source: 'import',
    type: 'lead',
    stage: 'new',
    tags,
    notes: `Imported from HubSpot (contact id ${contact.id})`,
    assignedTo: '',
    deleted: false,
    subscribedAt: FieldValue.serverTimestamp(),
    unsubscribedAt: null,
    bouncedAt: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    lastContactedAt: null,
  })

  try {
    await adminDb.collection('activities').add({
      orgId: integration.orgId,
      contactId: docRef.id,
      type: 'note',
      summary: `Imported from HubSpot (${integration.name})`,
      metadata: { integrationId: integration.id, provider: 'hubspot', hubspotContactId: contact.id },
      createdBy: 'integration-sync',
      createdAt: FieldValue.serverTimestamp(),
    })
  } catch (err) {
    console.error('[hubspot-sync] activity log failed', err)
  }

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
      console.error('[hubspot-sync] auto-enroll failed', { campaignId }, err)
    }
  }

  return 'created'
}
