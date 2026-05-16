// lib/ads/providers/meta/client.ts
import type { AdAccount } from '@/lib/ads/types'
import { META_GRAPH_BASE } from './constants'

interface MetaAdAccountRaw {
  id: string
  name: string
  currency: string
  timezone_name: string
  business?: { id: string; name?: string }
  account_status?: number // 1=ACTIVE, 2=DISABLED, 3=UNSETTLED, 7=PENDING_RISK_REVIEW, 9=IN_GRACE_PERIOD
}

function normalizeStatus(code?: number): AdAccount['status'] {
  switch (code) {
    case 1:
      return 'ACTIVE'
    case 2:
      return 'DISABLED'
    case 3:
      return 'UNSETTLED'
    case 7:
      return 'PENDING_RISK_REVIEW'
    case 9:
      return 'IN_GRACE_PERIOD'
    default:
      return 'UNKNOWN'
  }
}

export async function listAdAccounts(args: { accessToken: string }): Promise<AdAccount[]> {
  const url = new URL(`${META_GRAPH_BASE}/me/adaccounts`)
  url.searchParams.set('fields', 'id,name,currency,timezone_name,business,account_status')
  url.searchParams.set('access_token', args.accessToken)

  const res = await fetch(url.toString())
  const body = (await res.json()) as
    | { data: MetaAdAccountRaw[] }
    | { error: { message: string; code?: number } }

  if (!res.ok || 'error' in body) {
    const msg = 'error' in body ? body.error.message : `HTTP ${res.status}`
    throw new Error(`Meta listAdAccounts failed: ${msg}`)
  }

  return body.data.map((raw): AdAccount => ({
    id: raw.id,
    name: raw.name,
    currency: raw.currency,
    timezone: raw.timezone_name,
    businessId: raw.business?.id,
    status: normalizeStatus(raw.account_status),
  }))
}
