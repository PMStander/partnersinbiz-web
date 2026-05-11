// lib/email-analytics/aggregate.ts
//
// Email analytics aggregation layer. Pulls from the `emails` collection plus
// the pre-aggregated `broadcasts.stats`, `campaigns.stats`, and
// `sequence_enrollments` to produce dashboard-ready overviews, timeseries,
// per-broadcast/per-sequence detail, and per-contact engagement.

import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import type { Email } from '@/lib/email/types'
import type { Broadcast, BroadcastSendStats } from '@/lib/broadcasts/types'
import type { Campaign } from '@/lib/campaigns/types'
import type {
  Sequence,
  SequenceEnrollment,
  EnrollmentStatus,
} from '@/lib/sequences/types'
import type { Contact } from '@/lib/crm/types'

// ── Types ───────────────────────────────────────────────────────────────────

export interface DateRange {
  from: Date // inclusive
  to: Date // exclusive
}

export interface OrgEmailOverview {
  range: { from: string; to: string }
  totals: {
    sent: number
    delivered: number
    opened: number
    clicked: number
    bounced: number
    unsubscribed: number
    failed: number
  }
  rates: {
    deliveryRate: number
    openRate: number
    clickRate: number
    ctrOnOpens: number
    bounceRate: number
    unsubRate: number
  }
  bySource: {
    broadcast: { sent: number; opened: number; clicked: number }
    campaign: { sent: number; opened: number; clicked: number }
    sequence: { sent: number; opened: number; clicked: number }
    oneOff: { sent: number; opened: number; clicked: number }
  }
  topBroadcasts: Array<{
    id: string
    name: string
    sent: number
    opened: number
    clicked: number
    openRate: number
    clickRate: number
  }>
  topCampaigns: Array<{
    id: string
    name: string
    sent: number
    opened: number
    clicked: number
    openRate: number
    clickRate: number
  }>
  worstBounces: Array<{ id: string; name: string; bounced: number; bounceRate: number }>
}

export interface EngagementTimeseries {
  range: { from: string; to: string }
  bucket: 'day' | 'week'
  series: Array<{
    date: string
    sent: number
    delivered: number
    opened: number
    clicked: number
    bounced: number
  }>
}

export interface BroadcastDetailedStats {
  broadcastId: string
  stats: BroadcastSendStats
  rates: {
    deliveryRate: number
    openRate: number
    clickRate: number
    bounceRate: number
    unsubRate: number
  }
  timeline: Array<{ date: string; sent: number; opened: number; clicked: number }>
  topClicks: Array<{ url: string; clicks: number }>
  topDomains: Array<{ domain: string; sent: number; opened: number; openRate: number }>
  unsubReasons: Record<string, number>
}

export interface SequenceDetailedStats {
  sequenceId: string
  totalEnrollments: number
  byStatus: Record<string, number>
  stepFunnel: Array<{
    stepNumber: number
    subject: string
    sent: number
    opened: number
    clicked: number
    dropOffPercent: number
  }>
  averageCompletionDays: number
}

export interface ContactEngagement {
  contactId: string
  email: string
  name: string
  score: number
  sent: number
  opened: number
  clicked: number
  lastEngagedAt: string | null
  lastSentAt: string | null
  status:
    | 'highly-engaged'
    | 'engaged'
    | 'cooling'
    | 'dormant'
    | 'unsubscribed'
    | 'bounced'
}

export interface OrgComparisonRow {
  orgId: string
  orgName: string
  sent: number
  openRate: number
  clickRate: number
  bounceRate: number
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const MAX_EMAILS_PER_QUERY = 50_000
const CHUNK_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000

function safeRate(numerator: number, denominator: number): number {
  if (!denominator || denominator <= 0) return 0
  return Math.round((numerator / denominator) * 10_000) / 10_000
}

function rangeToMillis(range: DateRange): { fromMs: number; toMs: number } {
  return { fromMs: range.from.getTime(), toMs: range.to.getTime() }
}

function tsToMs(ts: Timestamp | null | undefined): number | null {
  if (!ts) return null
  try {
    return ts.toMillis()
  } catch {
    return null
  }
}

function toIso(d: Date): string {
  return d.toISOString()
}

function dayKey(ms: number): string {
  const d = new Date(ms)
  // YYYY-MM-DD in UTC for stable buckets across timezones.
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function weekKey(ms: number): string {
  // ISO week (Mon=1..Sun=7). Returns "GGGG-Www".
  const d = new Date(ms)
  // Shift to Thursday of the current week to find ISO week year correctly.
  const day = (d.getUTCDay() + 6) % 7 // 0..6, Monday=0
  const thursday = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day + 3),
  )
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1))
  const week =
    1 +
    Math.round(
      ((thursday.getTime() - yearStart.getTime()) / DAY_MS - 3 + ((yearStart.getUTCDay() + 6) % 7)) /
        7,
    )
  return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

/**
 * Fetch all emails for an org within a date range. Chunks the query into
 * 30-day windows to stay well under the 50k cap for very long ranges.
 */
async function fetchEmailsInRange(orgId: string, range: DateRange): Promise<Email[]> {
  const { fromMs, toMs } = rangeToMillis(range)
  if (toMs <= fromMs) return []

  const windows: Array<{ from: Date; to: Date }> = []
  let cursor = fromMs
  while (cursor < toMs) {
    const next = Math.min(cursor + CHUNK_DAYS * DAY_MS, toMs)
    windows.push({ from: new Date(cursor), to: new Date(next) })
    cursor = next
  }

  const all: Email[] = []
  for (const w of windows) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const snap: any = await (adminDb.collection('emails') as any)
      .where('orgId', '==', orgId)
      .where('sentAt', '>=', Timestamp.fromDate(w.from))
      .where('sentAt', '<', Timestamp.fromDate(w.to))
      .limit(MAX_EMAILS_PER_QUERY)
      .get()
     
    for (const doc of snap.docs) {
      const data = doc.data() as Email
      if (data.deleted === true) continue
      all.push({ ...data, id: doc.id })
    }
  }
  return all
}

function classifySource(e: Email): 'broadcast' | 'campaign' | 'sequence' | 'oneOff' {
  if (e.broadcastId) return 'broadcast'
  if (e.campaignId) return 'campaign'
  if (e.sequenceId) return 'sequence'
  return 'oneOff'
}

function emailIsDelivered(e: Email): boolean {
  // No webhook 'delivered' status in this codebase — treat any of
  // sent/opened/clicked as delivered (i.e. not failed and not bounced).
  return (
    (e.status === 'sent' || e.status === 'opened' || e.status === 'clicked') &&
    !e.bouncedAt
  )
}

function emailIsBounced(e: Email): boolean {
  return !!e.bouncedAt
}

function emailIsFailed(e: Email): boolean {
  return e.status === 'failed'
}

function emailIsOpened(e: Email): boolean {
  return !!e.openedAt || e.status === 'opened' || e.status === 'clicked'
}

function emailIsClicked(e: Email): boolean {
  return !!e.clickedAt || e.status === 'clicked'
}

// ── Overview ────────────────────────────────────────────────────────────────

export async function getOrgEmailOverview(
  orgId: string,
  range: DateRange,
): Promise<OrgEmailOverview> {
  const emails = await fetchEmailsInRange(orgId, range)
  const { fromMs, toMs } = rangeToMillis(range)

  let sent = 0
  let delivered = 0
  let opened = 0
  let clicked = 0
  let bounced = 0
  let failed = 0
  // unsubscribed is derived from contacts.unsubscribedAt below

  const bySource = {
    broadcast: { sent: 0, opened: 0, clicked: 0 },
    campaign: { sent: 0, opened: 0, clicked: 0 },
    sequence: { sent: 0, opened: 0, clicked: 0 },
    oneOff: { sent: 0, opened: 0, clicked: 0 },
  }

  for (const e of emails) {
    sent += 1
    if (emailIsDelivered(e)) delivered += 1
    if (emailIsOpened(e)) opened += 1
    if (emailIsClicked(e)) clicked += 1
    if (emailIsBounced(e)) bounced += 1
    if (emailIsFailed(e)) failed += 1

    const src = classifySource(e)
    bySource[src].sent += 1
    if (emailIsOpened(e)) bySource[src].opened += 1
    if (emailIsClicked(e)) bySource[src].clicked += 1
  }

  // Unsubscribes in the window — pull contacts unsubscribed within the range.
  let unsubscribed = 0
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const unsubSnap: any = await (adminDb.collection('contacts') as any)
      .where('orgId', '==', orgId)
      .where('unsubscribedAt', '>=', Timestamp.fromDate(range.from))
      .where('unsubscribedAt', '<', Timestamp.fromDate(range.to))
      .get()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    unsubscribed = unsubSnap.docs.filter((d: any) => d.data().deleted !== true).length
  } catch {
    // Missing composite index on contacts(orgId, unsubscribedAt) — fall back
    // to scanning all contacts in the org. Cheap for small orgs.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allSnap: any = await (adminDb.collection('contacts') as any)
      .where('orgId', '==', orgId)
      .get()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    unsubscribed = allSnap.docs.filter((d: any) => {
      const data = d.data() as Contact
      if (data.deleted === true) return false
      const ms = tsToMs(data.unsubscribedAt)
      return ms !== null && ms >= fromMs && ms < toMs
    }).length
  }

  // Top broadcasts/campaigns — read pre-aggregated stats directly. We pull all
  // broadcasts/campaigns for the org and filter to those active in the range.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const broadcastsSnap: any = await (adminDb.collection('broadcasts') as any)
    .where('orgId', '==', orgId)
    .get()
  const broadcastsInRange: Broadcast[] = broadcastsSnap.docs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((d: any) => ({ id: d.id, ...d.data() } as Broadcast))
    .filter((b: Broadcast) => {
      if (b.deleted === true) return false
      const startMs = tsToMs(b.sendStartedAt) ?? tsToMs(b.scheduledFor) ?? tsToMs(b.createdAt)
      if (startMs === null) return false
      return startMs >= fromMs && startMs < toMs
    })

  const topBroadcasts = broadcastsInRange
    .map((b: Broadcast) => {
      const s = b.stats ?? {
        sent: 0,
        opened: 0,
        clicked: 0,
        delivered: 0,
        bounced: 0,
        unsubscribed: 0,
        failed: 0,
        audienceSize: 0,
        queued: 0,
      }
      const denom = s.delivered || s.sent
      return {
        id: b.id,
        name: b.name,
        sent: s.sent,
        opened: s.opened,
        clicked: s.clicked,
        openRate: safeRate(s.opened, denom),
        clickRate: safeRate(s.clicked, denom),
      }
    })
    .sort((a, b) => b.sent - a.sent)
    .slice(0, 5)

  const worstBounces = broadcastsInRange
    .map((b: Broadcast) => {
      const s = b.stats ?? { sent: 0, bounced: 0 }
      return {
        id: b.id,
        name: b.name,
        bounced: s.bounced ?? 0,
        bounceRate: safeRate(s.bounced ?? 0, s.sent ?? 0),
      }
    })
    .filter((b) => b.bounced > 0)
    .sort((a, b) => b.bounceRate - a.bounceRate)
    .slice(0, 5)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const campaignsSnap: any = await (adminDb.collection('campaigns') as any)
    .where('orgId', '==', orgId)
    .get()
  const topCampaigns = campaignsSnap.docs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((d: any) => ({ id: d.id, ...d.data() } as Campaign))
    .filter((c: Campaign) => {
      if (c.deleted === true) return false
      const startMs = tsToMs(c.startAt) ?? tsToMs(c.createdAt)
      if (startMs === null) return false
      return startMs >= fromMs && startMs < toMs
    })
    .map((c: Campaign) => {
      const s = c.stats ?? {
        enrolled: 0,
        sent: 0,
        delivered: 0,
        opened: 0,
        clicked: 0,
        bounced: 0,
        unsubscribed: 0,
      }
      const denom = s.delivered || s.sent
      return {
        id: c.id,
        name: c.name,
        sent: s.sent,
        opened: s.opened,
        clicked: s.clicked,
        openRate: safeRate(s.opened, denom),
        clickRate: safeRate(s.clicked, denom),
      }
    })
    .sort((a: { sent: number }, b: { sent: number }) => b.sent - a.sent)
    .slice(0, 5)

  return {
    range: { from: toIso(range.from), to: toIso(range.to) },
    totals: { sent, delivered, opened, clicked, bounced, unsubscribed, failed },
    rates: {
      deliveryRate: safeRate(delivered, sent),
      openRate: safeRate(opened, delivered),
      clickRate: safeRate(clicked, delivered),
      ctrOnOpens: safeRate(clicked, opened),
      bounceRate: safeRate(bounced, sent),
      unsubRate: safeRate(unsubscribed, delivered),
    },
    bySource,
    topBroadcasts,
    topCampaigns,
    worstBounces,
  }
}

// ── Timeseries ──────────────────────────────────────────────────────────────

export async function getEngagementTimeseries(
  orgId: string,
  range: DateRange,
  bucket: 'day' | 'week',
): Promise<EngagementTimeseries> {
  const emails = await fetchEmailsInRange(orgId, range)
  const bucketize = bucket === 'week' ? weekKey : dayKey

  const map = new Map<
    string,
    { sent: number; delivered: number; opened: number; clicked: number; bounced: number }
  >()

  // Pre-fill empty buckets so charts show gaps as zeros, not missing points.
  const { fromMs, toMs } = rangeToMillis(range)
  if (bucket === 'day') {
    for (let t = fromMs; t < toMs; t += DAY_MS) {
      map.set(dayKey(t), { sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0 })
    }
  } else {
    // Weekly: step day-by-day and bucket so we get all weeks covered.
    for (let t = fromMs; t < toMs; t += DAY_MS) {
      const k = weekKey(t)
      if (!map.has(k)) {
        map.set(k, { sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0 })
      }
    }
  }

  for (const e of emails) {
    const ms = tsToMs(e.sentAt)
    if (ms === null) continue
    const key = bucketize(ms)
    const slot = map.get(key) ?? {
      sent: 0,
      delivered: 0,
      opened: 0,
      clicked: 0,
      bounced: 0,
    }
    slot.sent += 1
    if (emailIsDelivered(e)) slot.delivered += 1
    if (emailIsOpened(e)) slot.opened += 1
    if (emailIsClicked(e)) slot.clicked += 1
    if (emailIsBounced(e)) slot.bounced += 1
    map.set(key, slot)
  }

  const series = Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, ...v }))

  return {
    range: { from: toIso(range.from), to: toIso(range.to) },
    bucket,
    series,
  }
}

// ── Broadcast detail ────────────────────────────────────────────────────────

export async function getBroadcastStats(
  orgId: string,
  broadcastId: string,
): Promise<BroadcastDetailedStats> {
  const bSnap = await adminDb.collection('broadcasts').doc(broadcastId).get()
  if (!bSnap.exists || bSnap.data()?.deleted === true || bSnap.data()?.orgId !== orgId) {
    throw new Error('Broadcast not found')
  }
  const broadcast = { id: bSnap.id, ...bSnap.data() } as Broadcast
  const stats = broadcast.stats ?? {
    audienceSize: 0,
    queued: 0,
    sent: 0,
    delivered: 0,
    opened: 0,
    clicked: 0,
    bounced: 0,
    unsubscribed: 0,
    failed: 0,
  }

  // Per-email pull, scoped to this broadcast.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const emailsSnap: any = await (adminDb.collection('emails') as any)
    .where('orgId', '==', orgId)
    .where('broadcastId', '==', broadcastId)
    .limit(MAX_EMAILS_PER_QUERY)
    .get()
  const emails: Email[] = emailsSnap.docs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((d: any) => ({ id: d.id, ...d.data() } as Email))
     
    .filter((e: Email) => e.deleted !== true)

  // Timeline by day
  const timelineMap = new Map<string, { sent: number; opened: number; clicked: number }>()
  // Domain stats
  const domainMap = new Map<string, { sent: number; opened: number }>()

  for (const e of emails) {
    const ms = tsToMs(e.sentAt)
    if (ms !== null) {
      const k = dayKey(ms)
      const slot = timelineMap.get(k) ?? { sent: 0, opened: 0, clicked: 0 }
      slot.sent += 1
      if (emailIsOpened(e)) slot.opened += 1
      if (emailIsClicked(e)) slot.clicked += 1
      timelineMap.set(k, slot)
    }
    const at = (e.to ?? '').split('@')[1]?.toLowerCase().trim()
    if (at) {
      const dslot = domainMap.get(at) ?? { sent: 0, opened: 0 }
      dslot.sent += 1
      if (emailIsOpened(e)) dslot.opened += 1
      domainMap.set(at, dslot)
    }
  }

  const timeline = Array.from(timelineMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, ...v }))

  const topDomains = Array.from(domainMap.entries())
    .map(([domain, v]) => ({
      domain,
      sent: v.sent,
      opened: v.opened,
      openRate: safeRate(v.opened, v.sent),
    }))
    .sort((a, b) => b.sent - a.sent)
    .slice(0, 10)

  // Top clicks — pull from `link_clicks` collection via shortened links
  // owned by this org. We can't filter by broadcastId directly (links don't
  // carry it), so we settle for: links the broadcast's HTML body references
  // (cheap) AND fall back to overall org top URLs in the same time window.
  const topClicks: Array<{ url: string; clicks: number }> = []
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const linksSnap: any = await (adminDb.collection('shortened_links') as any)
      .where('orgId', '==', orgId)
      .get()
    const bodyHtml = broadcast.content?.bodyHtml ?? ''
     
    const linksReferenced = linksSnap.docs
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((d: any) => ({ id: d.id, ...d.data() }))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((l: any) => bodyHtml.includes(l.shortCode) || bodyHtml.includes(l.shortUrl))
    for (const l of linksReferenced) {
      topClicks.push({ url: l.originalUrl as string, clicks: (l.clickCount as number) ?? 0 })
    }
  } catch {
    // shortened_links collection may not exist or be empty — empty list is fine.
  }
  topClicks.sort((a, b) => b.clicks - a.clicks)

  const denom = stats.delivered || stats.sent
  return {
    broadcastId,
    stats,
    rates: {
      deliveryRate: safeRate(stats.delivered, stats.sent),
      openRate: safeRate(stats.opened, denom),
      clickRate: safeRate(stats.clicked, denom),
      bounceRate: safeRate(stats.bounced, stats.sent),
      unsubRate: safeRate(stats.unsubscribed, denom),
    },
    timeline,
    topClicks: topClicks.slice(0, 10),
    topDomains,
    unsubReasons: {},
  }
}

// ── Sequence detail ─────────────────────────────────────────────────────────

export async function getSequenceStats(
  orgId: string,
  sequenceId: string,
): Promise<SequenceDetailedStats> {
  const sSnap = await adminDb.collection('sequences').doc(sequenceId).get()
  if (!sSnap.exists || sSnap.data()?.deleted === true || sSnap.data()?.orgId !== orgId) {
    throw new Error('Sequence not found')
  }
  const sequence = { id: sSnap.id, ...sSnap.data() } as Sequence

  // Enrollments
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const enrollSnap: any = await (adminDb.collection('sequence_enrollments') as any)
    .where('orgId', '==', orgId)
    .where('sequenceId', '==', sequenceId)
    .get()
  const enrollments: SequenceEnrollment[] = enrollSnap.docs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((d: any) => ({ id: d.id, ...d.data() } as SequenceEnrollment))
     
    .filter((e: SequenceEnrollment) => e.deleted !== true)

  const byStatus: Record<EnrollmentStatus | string, number> = {
    active: 0,
    paused: 0,
    completed: 0,
    exited: 0,
  }
  let completionDaysSum = 0
  let completionCount = 0
  for (const e of enrollments) {
    byStatus[e.status] = (byStatus[e.status] ?? 0) + 1
    if (e.status === 'completed') {
      const start = tsToMs(e.enrolledAt)
      const end = tsToMs(e.completedAt ?? null)
      if (start !== null && end !== null && end > start) {
        completionDaysSum += (end - start) / DAY_MS
        completionCount += 1
      }
    }
  }

  // Per-step email aggregates
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const emailsSnap: any = await (adminDb.collection('emails') as any)
    .where('orgId', '==', orgId)
    .where('sequenceId', '==', sequenceId)
    .limit(MAX_EMAILS_PER_QUERY)
    .get()
  const stepAgg = new Map<number, { sent: number; opened: number; clicked: number }>()
   
  for (const doc of emailsSnap.docs) {
    const e = { id: doc.id, ...doc.data() } as Email
    if (e.deleted === true) continue
    const step = typeof e.sequenceStep === 'number' ? e.sequenceStep : -1
    if (step < 0) continue
    const slot = stepAgg.get(step) ?? { sent: 0, opened: 0, clicked: 0 }
    slot.sent += 1
    if (emailIsOpened(e)) slot.opened += 1
    if (emailIsClicked(e)) slot.clicked += 1
    stepAgg.set(step, slot)
  }

  const steps = Array.isArray(sequence.steps) ? sequence.steps : []
  const totalEnrollments = enrollments.length
  const stepFunnel = steps.map((s, idx) => {
    const agg = stepAgg.get(idx) ?? { sent: 0, opened: 0, clicked: 0 }
    const dropOffPercent =
      totalEnrollments > 0
        ? Math.round((1 - agg.sent / totalEnrollments) * 10_000) / 100
        : 0
    return {
      stepNumber: s.stepNumber ?? idx,
      subject: s.subject ?? '',
      sent: agg.sent,
      opened: agg.opened,
      clicked: agg.clicked,
      dropOffPercent,
    }
  })

  return {
    sequenceId,
    totalEnrollments,
    byStatus,
    stepFunnel,
    averageCompletionDays:
      completionCount > 0
        ? Math.round((completionDaysSum / completionCount) * 100) / 100
        : 0,
  }
}

// ── Contact engagement ──────────────────────────────────────────────────────

export async function getContactEngagement(
  orgId: string,
  opts?: { limit?: number; status?: ContactEngagement['status'] },
): Promise<ContactEngagement[]> {
  const limit = Math.max(1, Math.min(500, opts?.limit ?? 100))

  // Pull contacts for the org (capped).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contactsSnap: any = await (adminDb.collection('contacts') as any)
    .where('orgId', '==', orgId)
    .limit(5000)
    .get()
  const contacts: Contact[] = contactsSnap.docs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((d: any) => ({ id: d.id, ...d.data() } as Contact))
    .filter((c: Contact) => c.deleted !== true)

  if (contacts.length === 0) return []

  // Pull emails for the org over the last 180 days (the engagement window).
  const to = new Date()
  const from = new Date(to.getTime() - 180 * DAY_MS)
  const emails = await fetchEmailsInRange(orgId, { from, to })

  const perContact = new Map<
    string,
    {
      sent: number
      opened: number
      clicked: number
      bounced: number
      lastEngagedMs: number | null
      lastSentMs: number | null
    }
  >()
  for (const e of emails) {
    if (!e.contactId) continue
    const slot = perContact.get(e.contactId) ?? {
      sent: 0,
      opened: 0,
      clicked: 0,
      bounced: 0,
      lastEngagedMs: null,
      lastSentMs: null,
    }
    slot.sent += 1
    const sentMs = tsToMs(e.sentAt)
    if (sentMs !== null) {
      slot.lastSentMs = Math.max(slot.lastSentMs ?? 0, sentMs)
    }
    if (emailIsOpened(e)) {
      slot.opened += 1
      const ems = tsToMs(e.openedAt) ?? tsToMs(e.clickedAt) ?? sentMs
      if (ems !== null) slot.lastEngagedMs = Math.max(slot.lastEngagedMs ?? 0, ems)
    }
    if (emailIsClicked(e)) {
      slot.clicked += 1
      const ems = tsToMs(e.clickedAt) ?? sentMs
      if (ems !== null) slot.lastEngagedMs = Math.max(slot.lastEngagedMs ?? 0, ems)
    }
    if (emailIsBounced(e)) slot.bounced += 1
    perContact.set(e.contactId, slot)
  }

  const now = Date.now()
  const rows: ContactEngagement[] = contacts.map((c) => {
    const agg = perContact.get(c.id) ?? {
      sent: 0,
      opened: 0,
      clicked: 0,
      bounced: 0,
      lastEngagedMs: null,
      lastSentMs: null,
    }
    const daysSinceLastEngaged =
      agg.lastEngagedMs !== null ? (now - agg.lastEngagedMs) / DAY_MS : 9999
    const rawScore =
      agg.opened * 5 + agg.clicked * 15 - agg.bounced * 30 - daysSinceLastEngaged * 0.5
    const score = Math.max(0, Math.min(100, Math.round(rawScore)))

    let status: ContactEngagement['status']
    if (c.unsubscribedAt) status = 'unsubscribed'
    else if (c.bouncedAt || agg.bounced > 0) status = 'bounced'
    else if (score >= 70) status = 'highly-engaged'
    else if (score >= 40) status = 'engaged'
    else if (agg.lastEngagedMs !== null && daysSinceLastEngaged < 60) status = 'cooling'
    else status = 'dormant'

    return {
      contactId: c.id,
      email: c.email ?? '',
      name: c.name ?? '',
      score,
      sent: agg.sent,
      opened: agg.opened,
      clicked: agg.clicked,
      lastEngagedAt: agg.lastEngagedMs !== null ? new Date(agg.lastEngagedMs).toISOString() : null,
      lastSentAt: agg.lastSentMs !== null ? new Date(agg.lastSentMs).toISOString() : null,
      status,
    }
  })

  const filtered = opts?.status ? rows.filter((r) => r.status === opts.status) : rows
  return filtered.sort((a, b) => b.score - a.score).slice(0, limit)
}

// ── Platform leaderboard ────────────────────────────────────────────────────

export async function getPlatformLeaderboard(range: DateRange): Promise<OrgComparisonRow[]> {
  // Pull all orgs.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orgsSnap: any = await (adminDb.collection('organizations') as any).get()
   
  const orgs = orgsSnap.docs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((d: any) => ({ id: d.id, ...d.data() }))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((o: any) => o.deleted !== true)

  const rows: OrgComparisonRow[] = []
  for (const org of orgs) {
    const emails = await fetchEmailsInRange(org.id, range)
    if (emails.length === 0) continue
    let sent = 0
    let delivered = 0
    let opened = 0
    let clicked = 0
    let bounced = 0
    for (const e of emails) {
      sent += 1
      if (emailIsDelivered(e)) delivered += 1
      if (emailIsOpened(e)) opened += 1
      if (emailIsClicked(e)) clicked += 1
      if (emailIsBounced(e)) bounced += 1
    }
    rows.push({
      orgId: org.id,
      orgName: typeof org.name === 'string' ? org.name : org.id,
      sent,
      openRate: safeRate(opened, delivered),
      clickRate: safeRate(clicked, delivered),
      bounceRate: safeRate(bounced, sent),
    })
  }
  return rows.sort((a, b) => b.sent - a.sent)
}
