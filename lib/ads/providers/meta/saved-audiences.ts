// lib/ads/providers/meta/saved-audiences.ts
// Meta Marketing API v25.0 — Saved Audience endpoints
import { META_GRAPH_BASE } from './constants'
import { targetingToMetaJson } from './mappers'
import type { AdSavedAudience, AdTargeting } from '@/lib/ads/types'

const SA_FIELDS = ['id', 'name', 'description', 'targeting', 'account_id'].join(',')

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

// ─── Exported types ────────────────────────────────────────────────────────

export interface MetaSavedAudienceRaw {
  id: string
  name: string
  description?: string
  targeting?: unknown
  account_id?: string
}

// ─── Create ────────────────────────────────────────────────────────────────

export async function createMetaSavedAudience(args: {
  adAccountId: string
  accessToken: string
  sa: AdSavedAudience
}): Promise<{ metaSavId: string }> {
  const url = `${META_GRAPH_BASE}/${stripActPrefix(args.adAccountId)}/saved_audiences`
  const { sa } = args
  const form: Record<string, string> = {
    name: sa.name,
    targeting: targetingToMetaJson(sa.targeting),
    access_token: args.accessToken,
  }
  if (sa.description) form.description = sa.description

  const res = await fetch(url, { method: 'POST', body: new URLSearchParams(form) })
  const body = await res.json()
  if (!res.ok || (body && typeof body === 'object' && 'error' in body)) {
    throw metaError(body, res.status)
  }
  return { metaSavId: (body as { id: string }).id }
}

// ─── List ──────────────────────────────────────────────────────────────────

export async function listMetaSavedAudiences(args: {
  adAccountId: string
  accessToken: string
}): Promise<{ data: MetaSavedAudienceRaw[] }> {
  const url = new URL(`${META_GRAPH_BASE}/${stripActPrefix(args.adAccountId)}/saved_audiences`)
  url.searchParams.set('fields', SA_FIELDS)
  url.searchParams.set('access_token', args.accessToken)

  const res = await fetch(url.toString())
  const body = await res.json()
  if (!res.ok || (body && typeof body === 'object' && 'error' in body)) {
    throw metaError(body, res.status)
  }
  return { data: (body as { data: MetaSavedAudienceRaw[] }).data ?? [] }
}

// ─── Get single ────────────────────────────────────────────────────────────

export async function getMetaSavedAudience(args: {
  metaSavId: string
  accessToken: string
}): Promise<MetaSavedAudienceRaw> {
  const url = new URL(`${META_GRAPH_BASE}/${args.metaSavId}`)
  url.searchParams.set('fields', SA_FIELDS)
  url.searchParams.set('access_token', args.accessToken)
  const res = await fetch(url.toString())
  const body = await res.json()
  if (!res.ok || (body && typeof body === 'object' && 'error' in body)) {
    throw metaError(body, res.status)
  }
  return body as MetaSavedAudienceRaw
}

// ─── Update ────────────────────────────────────────────────────────────────

export async function updateMetaSavedAudience(args: {
  metaSavId: string
  accessToken: string
  patch: { name?: string; description?: string; targeting?: AdTargeting }
}): Promise<{ success: boolean }> {
  const form: Record<string, string> = { access_token: args.accessToken }
  if (args.patch.name) form.name = args.patch.name
  if (args.patch.description) form.description = args.patch.description
  if (args.patch.targeting) form.targeting = targetingToMetaJson(args.patch.targeting)

  const res = await fetch(`${META_GRAPH_BASE}/${args.metaSavId}`, {
    method: 'POST',
    body: new URLSearchParams(form),
  })
  const body = await res.json()
  if (!res.ok || (body && typeof body === 'object' && 'error' in body)) {
    throw metaError(body, res.status)
  }
  return { success: true }
}

// ─── Delete ────────────────────────────────────────────────────────────────

export async function deleteMetaSavedAudience(args: {
  metaSavId: string
  accessToken: string
}): Promise<void> {
  const url = new URL(`${META_GRAPH_BASE}/${args.metaSavId}`)
  url.searchParams.set('access_token', args.accessToken)
  const res = await fetch(url.toString(), { method: 'DELETE' })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw metaError(body, res.status)
  }
}
