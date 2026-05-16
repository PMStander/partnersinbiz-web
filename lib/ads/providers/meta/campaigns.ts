// lib/ads/providers/meta/campaigns.ts
// Meta Marketing API v25.0 campaign endpoints
import { META_GRAPH_BASE } from './constants'
import { campaignToMetaForm, canonicalStatus } from './mappers'
import type { AdCampaign } from '@/lib/ads/types'

export interface MetaCampaignRaw {
  id: string
  name: string
  objective: string
  status: string
  daily_budget?: string
  lifetime_budget?: string
  bid_strategy?: string
  special_ad_categories?: string[]
  start_time?: string
  stop_time?: string
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

const CAMPAIGN_FIELDS = [
  'id', 'name', 'objective', 'status',
  'daily_budget', 'lifetime_budget', 'bid_strategy',
  'special_ad_categories', 'start_time', 'stop_time',
  'created_time', 'updated_time',
].join(',')

export async function createCampaign(args: {
  adAccountId: string // act_xxx or just xxx
  accessToken: string
  campaign: AdCampaign
}): Promise<{ metaCampaignId: string }> {
  const url = `${META_GRAPH_BASE}/${stripActPrefix(args.adAccountId)}/campaigns`
  const form = new URLSearchParams({
    ...campaignToMetaForm(args.campaign),
    access_token: args.accessToken,
  })
  const res = await fetch(url, { method: 'POST', body: form })
  const body = await res.json()
  if (!res.ok || (body && typeof body === 'object' && 'error' in body)) {
    throw metaError(body, res.status)
  }
  return { metaCampaignId: (body as { id: string }).id }
}

export async function listCampaigns(args: {
  adAccountId: string
  accessToken: string
  after?: string
  limit?: number
}): Promise<{ data: MetaCampaignRaw[]; nextAfter?: string }> {
  const url = new URL(`${META_GRAPH_BASE}/${stripActPrefix(args.adAccountId)}/campaigns`)
  url.searchParams.set('fields', CAMPAIGN_FIELDS)
  url.searchParams.set('limit', String(args.limit ?? 25))
  url.searchParams.set('access_token', args.accessToken)
  if (args.after) url.searchParams.set('after', args.after)
  const res = await fetch(url.toString())
  const body = await res.json()
  if (!res.ok || (body && typeof body === 'object' && 'error' in body)) {
    throw metaError(body, res.status)
  }
  const data = (body as { data: MetaCampaignRaw[]; paging?: { cursors?: { after?: string } } }).data ?? []
  const nextAfter = (body as { paging?: { cursors?: { after?: string } } }).paging?.cursors?.after
  return { data, nextAfter }
}

export async function getCampaign(args: {
  metaCampaignId: string
  accessToken: string
}): Promise<MetaCampaignRaw> {
  const url = new URL(`${META_GRAPH_BASE}/${args.metaCampaignId}`)
  url.searchParams.set('fields', CAMPAIGN_FIELDS)
  url.searchParams.set('access_token', args.accessToken)
  const res = await fetch(url.toString())
  const body = await res.json()
  if (!res.ok || (body && typeof body === 'object' && 'error' in body)) {
    throw metaError(body, res.status)
  }
  return body as MetaCampaignRaw
}

export async function updateCampaign(args: {
  metaCampaignId: string
  accessToken: string
  patch: Partial<AdCampaign>
  validateOnly?: boolean
}): Promise<{ success: boolean }> {
  const url = `${META_GRAPH_BASE}/${args.metaCampaignId}`
  // Build form from patch — drop `objective` since Meta blocks it on live campaigns;
  // caller can launch a new campaign instead.
  const form: Record<string, string> = {}
  if (args.patch.name) form.name = args.patch.name
  if (args.patch.status) form.status = canonicalStatus(args.patch.status)
  if (args.patch.dailyBudget != null) form.daily_budget = String(args.patch.dailyBudget)
  if (args.patch.lifetimeBudget != null) form.lifetime_budget = String(args.patch.lifetimeBudget)
  if (args.patch.bidStrategy) form.bid_strategy = args.patch.bidStrategy
  if (args.patch.specialAdCategories) {
    form.special_ad_categories = JSON.stringify(args.patch.specialAdCategories)
  }
  if (args.validateOnly) form.execution_options = JSON.stringify(['VALIDATE'])
  form.access_token = args.accessToken
  const res = await fetch(url, { method: 'POST', body: new URLSearchParams(form) })
  const body = await res.json()
  if (!res.ok || (body && typeof body === 'object' && 'error' in body)) {
    throw metaError(body, res.status)
  }
  return { success: true }
}

export async function deleteCampaign(args: {
  metaCampaignId: string
  accessToken: string
}): Promise<void> {
  const url = new URL(`${META_GRAPH_BASE}/${args.metaCampaignId}`)
  url.searchParams.set('access_token', args.accessToken)
  const res = await fetch(url.toString(), { method: 'DELETE' })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw metaError(body, res.status)
  }
}

export async function validateCampaign(args: {
  metaCampaignId: string
  accessToken: string
  patch: Partial<AdCampaign>
}): Promise<{ success: boolean }> {
  return updateCampaign({ ...args, validateOnly: true })
}
