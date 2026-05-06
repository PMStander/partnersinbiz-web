// lib/crm/integrations/handlers/gmail.ts
//
// Google Contacts sync via People API (OAuth 2.0 refresh-token flow).
//
// The handler exchanges the stored refresh token for a short-lived access
// token, then pages through all connections using the People API (v1).
// Contacts with no email address are skipped. Existing contacts get their
// tag list merged; bounced / unsubscribed contacts are left untouched.
//
// Credentials are taken from integration.config; clientId / clientSecret
// fall back to the platform-level env vars when not set per-integration.
//
// Out of scope for v1:
//   - Bidirectional sync (we only pull)
//   - Contact groups → tag mapping
//   - Phone / company field updates after first import

import { adminDb } from '@/lib/firebase/admin'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import type { CrmIntegration, CrmIntegrationSyncStats } from '../types'
import { EMPTY_SYNC_STATS } from '../types'
import type { Campaign } from '@/lib/campaigns/types'
import type { Sequence } from '@/lib/sequences/types'

interface GooglePerson {
  resourceName: string
  names?: Array<{
    displayName?: string
    givenName?: string
    familyName?: string
  }>
  emailAddresses?: Array<{ value?: string }>
  phoneNumbers?: Array<{ value?: string }>
  organizations?: Array<{ name?: string }>
}

interface PeopleListResponse {
  connections?: GooglePerson[]
  nextPageToken?: string
}

const PAGE_SIZE = 1000
const MAX_PAGES = 100

async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<string | null> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  })
  if (!res.ok) return null
  const data = await res.json()
  return data.access_token ?? null
}

export type GmailSyncResult =
  | { ok: true; stats: CrmIntegrationSyncStats }
  | { ok: false; error: string; stats: CrmIntegrationSyncStats }

export async function syncGmail(integration: CrmIntegration): Promise<GmailSyncResult> {
  const stats: CrmIntegrationSyncStats = { ...EMPTY_SYNC_STATS }

  const refreshToken = integration.config.refreshToken ?? ''
  if (!refreshToken) {
    return { ok: false, error: 'Missing refreshToken', stats }
  }

  const clientId =
    integration.config.clientId || (process.env.GOOGLE_CLIENT_ID ?? '')
  const clientSecret =
    integration.config.clientSecret || (process.env.GOOGLE_CLIENT_SECRET ?? '')

  if (!clientId || !clientSecret) {
    return { ok: false, error: 'Missing Google client credentials', stats }
  }

  let accessToken: string | null
  try {
    accessToken = await refreshAccessToken(refreshToken, clientId, clientSecret)
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Token refresh failed', stats }
  }

  if (!accessToken) {
    return { ok: false, error: 'Failed to obtain access token from Google', stats }
  }

  const baseUrl = 'https://people.googleapis.com/v1/people/me/connections'
  const personFields = 'names,emailAddresses,phoneNumbers,organizations'

  let pageToken: string | undefined
  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({
      personFields,
      pageSize: String(PAGE_SIZE),
    })
    if (pageToken) params.set('pageToken', pageToken)

    let pageData: PeopleListResponse
    try {
      const res = await fetch(`${baseUrl}?${params}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        return { ok: false, error: `Google People API ${res.status}: ${body.slice(0, 200)}`, stats }
      }
      pageData = await res.json() as PeopleListResponse
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Network error', stats }
    }

    const connections = pageData.connections ?? []
    for (const person of connections) {
      const email = (person.emailAddresses?.[0]?.value ?? '').trim().toLowerCase()
      if (!email) {
        stats.skipped++
        continue
      }
      stats.imported++

      try {
        const result = await upsertContact(integration, person, email)
        if (result === 'created') stats.created++
        else if (result === 'updated') stats.updated++
        else stats.skipped++
      } catch (err) {
        console.error('[gmail-sync] upsert failed', email, err)
        stats.errored++
      }
    }

    if (!pageData.nextPageToken) break
    pageToken = pageData.nextPageToken
  }

  return { ok: true, stats }
}

async function upsertContact(
  integration: CrmIntegration,
  person: GooglePerson,
  email: string,
): Promise<'created' | 'updated' | 'skipped'> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existingSnap = await (adminDb.collection('contacts') as any)
    .where('orgId', '==', integration.orgId)
    .where('email', '==', email)
    .limit(1)
    .get()

  const nameEntry = person.names?.[0]
  const firstName = nameEntry?.givenName ?? ''
  const lastName = nameEntry?.familyName ?? ''
  const fullName = (nameEntry?.displayName ?? [firstName, lastName].filter(Boolean).join(' ')) || email
  const company = person.organizations?.[0]?.name ?? ''
  const phone = person.phoneNumbers?.[0]?.value ?? ''

  const tags = Array.from(new Set([...integration.autoTags]))

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
    notes: `Imported from Google Contacts (${person.resourceName})`,
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
      summary: `Imported from Google Contacts (${integration.name})`,
      metadata: {
        integrationId: integration.id,
        provider: 'gmail',
        resourceName: person.resourceName,
      },
      createdBy: 'integration-sync',
      createdAt: FieldValue.serverTimestamp(),
    })
  } catch (err) {
    console.error('[gmail-sync] activity log failed', err)
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
      console.error('[gmail-sync] auto-enroll failed', { campaignId }, err)
    }
  }

  return 'created'
}
