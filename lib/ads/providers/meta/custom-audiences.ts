// lib/ads/providers/meta/custom-audiences.ts
// Meta Marketing API v25.0 — Custom Audience endpoints (5 subtypes + upload-users)
import { META_GRAPH_BASE } from './constants'
import type {
  AdCustomAudience,
  AdCustomAudienceType,
  WebsiteCAUrlRule,
  EngagementCASource,
} from '@/lib/ads/types'

const META_SUBTYPE: Record<AdCustomAudienceType, string> = {
  CUSTOMER_LIST: 'CUSTOM',
  WEBSITE: 'WEBSITE',
  LOOKALIKE: 'LOOKALIKE',
  APP: 'APP',
  ENGAGEMENT: 'ENGAGEMENT',
}

const CA_FIELDS = [
  'id',
  'name',
  'subtype',
  'description',
  'retention_days',
  'approximate_count_lower_bound',
  'operation_status',
  'delivery_status',
].join(',')

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

// ─── Rule builders ─────────────────────────────────────────────────────────

function buildWebsiteRule(rules: WebsiteCAUrlRule[]): unknown {
  if (!rules.length) return {}
  // Build Meta inclusions rule shape: OR of url conditions
  const conditions = rules.map((r) => {
    switch (r.op) {
      case 'url_contains':
        return { url: { i_contains: r.value } }
      case 'url_equals':
        return { url: { eq: r.value } }
      case 'url_not_contains':
        return { url: { i_not_contains: r.value } }
    }
  })
  if (conditions.length === 1) return conditions[0]
  return { or: conditions }
}

function buildEngagementRule(source: EngagementCASource): unknown {
  return {
    inclusions: {
      operator: 'or',
      rules: [
        {
          event_sources: [{ id: source.sourceObjectId, type: source.engagementType }],
          retention_seconds: source.retentionDays * 86400,
          filter: { operator: 'and', filters: [] },
        },
      ],
    },
  }
}

// ─── Exported types ────────────────────────────────────────────────────────

export interface MetaCustomAudienceRaw {
  id: string
  name: string
  subtype: string
  description?: string
  retention_days?: number
  approximate_count_lower_bound?: number
  operation_status?: { code: number; description: string }
  delivery_status?: { code: number; description: string }
}

// ─── Create ────────────────────────────────────────────────────────────────

export async function createMetaCustomAudience(args: {
  adAccountId: string
  accessToken: string
  ca: AdCustomAudience
  /** Required when source.kind === 'LOOKALIKE' — the Meta-side origin CA id. */
  originMetaCaId?: string
}): Promise<{ metaCaId: string }> {
  const url = `${META_GRAPH_BASE}/${stripActPrefix(args.adAccountId)}/customaudiences`
  const { ca } = args
  const src = ca.source

  const form: Record<string, string> = {
    name: ca.name,
    subtype: META_SUBTYPE[ca.type],
    access_token: args.accessToken,
  }
  if (ca.description) form.description = ca.description

  switch (src.kind) {
    case 'CUSTOMER_LIST':
      form.customer_file_source = 'USER_PROVIDED_ONLY'
      break
    case 'WEBSITE':
      form.pixel_id = src.pixelId
      form.retention_days = String(src.retentionDays)
      form.rule = JSON.stringify(buildWebsiteRule(src.rules))
      break
    case 'LOOKALIKE': {
      const originId = args.originMetaCaId ?? src.sourceAudienceId
      form.origin_audience_id = originId
      form.lookalike_spec = JSON.stringify({
        type: 'similarity',
        country: src.country,
        ratio: src.percent / 100,
      })
      break
    }
    case 'APP':
      form.retention_days = String(src.retentionDays)
      break
    case 'ENGAGEMENT':
      form.rule = JSON.stringify(buildEngagementRule(src))
      form.retention_days = String(src.retentionDays)
      break
  }

  const res = await fetch(url, { method: 'POST', body: new URLSearchParams(form) })
  const body = await res.json()
  if (!res.ok || (body && typeof body === 'object' && 'error' in body)) {
    throw metaError(body, res.status)
  }
  return { metaCaId: (body as { id: string }).id }
}

// ─── List ──────────────────────────────────────────────────────────────────

export async function listMetaCustomAudiences(args: {
  adAccountId: string
  accessToken: string
  after?: string
}): Promise<{ data: MetaCustomAudienceRaw[]; nextAfter?: string }> {
  const url = new URL(`${META_GRAPH_BASE}/${stripActPrefix(args.adAccountId)}/customaudiences`)
  url.searchParams.set('fields', CA_FIELDS)
  url.searchParams.set('limit', '25')
  url.searchParams.set('access_token', args.accessToken)
  if (args.after) url.searchParams.set('after', args.after)

  const res = await fetch(url.toString())
  const body = await res.json()
  if (!res.ok || (body && typeof body === 'object' && 'error' in body)) {
    throw metaError(body, res.status)
  }
  const typed = body as {
    data: MetaCustomAudienceRaw[]
    paging?: { cursors?: { after?: string } }
  }
  return {
    data: typed.data ?? [],
    nextAfter: typed.paging?.cursors?.after,
  }
}

// ─── Get single ────────────────────────────────────────────────────────────

export async function getMetaCustomAudience(args: {
  metaCaId: string
  accessToken: string
}): Promise<MetaCustomAudienceRaw> {
  const url = new URL(`${META_GRAPH_BASE}/${args.metaCaId}`)
  url.searchParams.set('fields', CA_FIELDS)
  url.searchParams.set('access_token', args.accessToken)
  const res = await fetch(url.toString())
  const body = await res.json()
  if (!res.ok || (body && typeof body === 'object' && 'error' in body)) {
    throw metaError(body, res.status)
  }
  return body as MetaCustomAudienceRaw
}

// ─── Update ────────────────────────────────────────────────────────────────

export async function updateMetaCustomAudience(args: {
  metaCaId: string
  accessToken: string
  patch: { name?: string; description?: string }
}): Promise<{ success: boolean }> {
  const form: Record<string, string> = { access_token: args.accessToken }
  if (args.patch.name) form.name = args.patch.name
  if (args.patch.description) form.description = args.patch.description

  const res = await fetch(`${META_GRAPH_BASE}/${args.metaCaId}`, {
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

export async function deleteMetaCustomAudience(args: {
  metaCaId: string
  accessToken: string
}): Promise<void> {
  const url = new URL(`${META_GRAPH_BASE}/${args.metaCaId}`)
  url.searchParams.set('access_token', args.accessToken)
  const res = await fetch(url.toString(), { method: 'DELETE' })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw metaError(body, res.status)
  }
}

// ─── Upload customer list users ─────────────────────────────────────────────

export async function uploadCustomerListUsers(args: {
  metaCaId: string
  accessToken: string
  schema: string[]
  hashedRows: string[][]
}): Promise<{ success: boolean; numReceived?: number }> {
  const form = new URLSearchParams({
    payload: JSON.stringify({ schema: args.schema, data: args.hashedRows }),
    access_token: args.accessToken,
  })
  const res = await fetch(`${META_GRAPH_BASE}/${args.metaCaId}/users`, {
    method: 'POST',
    body: form,
  })
  const body = await res.json()
  if (!res.ok || (body && typeof body === 'object' && 'error' in body)) {
    throw metaError(body, res.status)
  }
  const typed = body as { num_received?: number }
  return { success: true, numReceived: typed.num_received }
}
