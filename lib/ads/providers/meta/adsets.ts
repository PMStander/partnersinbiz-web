// lib/ads/providers/meta/adsets.ts
// Meta Marketing API v25.0 ad set endpoints
import { META_GRAPH_BASE } from './constants'
import { adSetToMetaForm, canonicalStatus } from './mappers'
import type { AdSet } from '@/lib/ads/types'

export interface MetaAdSetRaw {
  id: string
  name: string
  campaign_id: string
  status: string
  daily_budget?: string
  lifetime_budget?: string
  bid_amount?: string
  optimization_goal: string
  billing_event: string
  targeting?: unknown
  start_time?: string
  end_time?: string
  created_time?: string
  updated_time?: string
}

function stripActPrefix(id: string): string {
  return id.startsWith('act_') ? id : `act_${id}`
}

function metaError(body: unknown, status: number): Error {
  if (body && typeof body === 'object' && 'error' in body) {
    const err = (body as { error: { message?: string } }).error
    return new Error(`Meta API error: ${err.message ?? `HTTP ${status}`}`)
  }
  return new Error(`Meta API error: HTTP ${status}`)
}

const ADSET_FIELDS = [
  'id', 'name', 'campaign_id', 'status',
  'daily_budget', 'lifetime_budget', 'bid_amount',
  'optimization_goal', 'billing_event', 'targeting',
  'start_time', 'end_time', 'created_time', 'updated_time',
].join(',')

export async function createAdSet(args: {
  adAccountId: string
  accessToken: string
  adSet: AdSet
  metaCampaignId: string
}): Promise<{ metaAdSetId: string }> {
  const url = `${META_GRAPH_BASE}/${stripActPrefix(args.adAccountId)}/adsets`
  const form = new URLSearchParams({
    ...adSetToMetaForm(args.adSet, args.metaCampaignId),
    access_token: args.accessToken,
  })
  const res = await fetch(url, { method: 'POST', body: form })
  const body = await res.json()
  if (!res.ok || (body && typeof body === 'object' && 'error' in body)) {
    throw metaError(body, res.status)
  }
  return { metaAdSetId: (body as { id: string }).id }
}

export async function listAdSets(args: {
  adAccountId?: string
  campaignId?: string
  accessToken: string
  after?: string
  limit?: number
}): Promise<{ data: MetaAdSetRaw[]; nextAfter?: string }> {
  // If campaignId provided, list by campaign; else list by ad account
  const base = args.campaignId
    ? `${META_GRAPH_BASE}/${args.campaignId}/adsets`
    : `${META_GRAPH_BASE}/${stripActPrefix(args.adAccountId!)}/adsets`

  const url = new URL(base)
  url.searchParams.set('fields', ADSET_FIELDS)
  url.searchParams.set('limit', String(args.limit ?? 25))
  url.searchParams.set('access_token', args.accessToken)
  if (args.after) url.searchParams.set('after', args.after)

  const res = await fetch(url.toString())
  const body = await res.json()
  if (!res.ok || (body && typeof body === 'object' && 'error' in body)) {
    throw metaError(body, res.status)
  }
  const data = (body as { data: MetaAdSetRaw[]; paging?: { cursors?: { after?: string } } }).data ?? []
  const nextAfter = (body as { paging?: { cursors?: { after?: string } } }).paging?.cursors?.after
  return { data, nextAfter }
}

export async function getAdSet(args: {
  metaAdSetId: string
  accessToken: string
}): Promise<MetaAdSetRaw> {
  const url = new URL(`${META_GRAPH_BASE}/${args.metaAdSetId}`)
  url.searchParams.set('fields', ADSET_FIELDS)
  url.searchParams.set('access_token', args.accessToken)
  const res = await fetch(url.toString())
  const body = await res.json()
  if (!res.ok || (body && typeof body === 'object' && 'error' in body)) {
    throw metaError(body, res.status)
  }
  return body as MetaAdSetRaw
}

/**
 * Update an ad set's simple fields: name, status, dailyBudget, lifetimeBudget, bidAmount.
 *
 * Phase 2 limitation: targeting and placement changes are NOT supported via this
 * update path. The `targeting` JSON requires a full AdSet to reconstruct accurately
 * via adSetToMetaForm. If you need to change targeting, delete and re-create the ad set
 * with the new targeting configuration.
 */
export async function updateAdSet(args: {
  metaAdSetId: string
  accessToken: string
  patch: Partial<AdSet>
  validateOnly?: boolean
}): Promise<{ success: boolean }> {
  const url = `${META_GRAPH_BASE}/${args.metaAdSetId}`
  const form: Record<string, string> = {}
  if (args.patch.name) form.name = args.patch.name
  if (args.patch.status) form.status = canonicalStatus(args.patch.status)
  if (args.patch.dailyBudget != null) form.daily_budget = String(args.patch.dailyBudget)
  if (args.patch.lifetimeBudget != null) form.lifetime_budget = String(args.patch.lifetimeBudget)
  if (args.patch.bidAmount != null) form.bid_amount = String(args.patch.bidAmount)
  if (args.validateOnly) form.execution_options = JSON.stringify(['VALIDATE'])
  form.access_token = args.accessToken
  const res = await fetch(url, { method: 'POST', body: new URLSearchParams(form) })
  const body = await res.json()
  if (!res.ok || (body && typeof body === 'object' && 'error' in body)) {
    throw metaError(body, res.status)
  }
  return { success: true }
}

export async function deleteAdSet(args: {
  metaAdSetId: string
  accessToken: string
}): Promise<void> {
  const url = new URL(`${META_GRAPH_BASE}/${args.metaAdSetId}`)
  url.searchParams.set('access_token', args.accessToken)
  const res = await fetch(url.toString(), { method: 'DELETE' })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw metaError(body, res.status)
  }
}

export async function validateAdSet(args: {
  metaAdSetId: string
  accessToken: string
  patch: Partial<AdSet>
}): Promise<{ success: boolean }> {
  return updateAdSet({ ...args, validateOnly: true })
}
