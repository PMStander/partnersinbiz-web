// lib/ads/providers/meta/capi.ts
import { META_GRAPH_BASE } from './constants'
import type { CapiEventInput } from '@/lib/ads/capi/types'
import type { CapiUserHash } from '@/lib/ads/types'

export interface SendCapiArgs {
  pixelId: string
  accessToken: string
  testEventCode?: string
  event: CapiEventInput & { userHash: CapiUserHash }
}

export interface SendCapiResult {
  eventsReceived: number
  messages?: string[]
}

export async function sendMetaCapiEvent(args: SendCapiArgs): Promise<SendCapiResult> {
  const url = `${META_GRAPH_BASE}/${args.pixelId}/events?access_token=${encodeURIComponent(args.accessToken)}`

  const eventData: Record<string, unknown> = {
    event_name: args.event.event_name,
    event_time: args.event.event_time,
    event_id: args.event.event_id,
    action_source: args.event.action_source,
    user_data: args.event.userHash,
  }
  if (args.event.custom_data) eventData.custom_data = args.event.custom_data
  if (args.event.event_source_url) eventData.event_source_url = args.event.event_source_url
  if (args.event.opt_out) eventData.opt_out = true

  const body: Record<string, unknown> = { data: [eventData] }
  if (args.testEventCode) body.test_event_code = args.testEventCode

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  const respBody = await res.json()

  if (!res.ok || (respBody && respBody.error)) {
    throw new Error(`Meta CAPI failed: ${respBody.error?.message ?? `HTTP ${res.status}`}`)
  }

  return {
    eventsReceived: respBody.events_received ?? 0,
    messages: respBody.messages,
  }
}
