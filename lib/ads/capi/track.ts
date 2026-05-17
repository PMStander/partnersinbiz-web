// lib/ads/capi/track.ts
import { Timestamp } from 'firebase-admin/firestore'
import { hashUser } from './hash'
import type { CapiEventInput } from './types'
import type { CapiFanoutResult, AdPixelConfig } from '@/lib/ads/types'

export interface TrackResult {
  event_id: string
  alreadyProcessed: boolean
  fanout: {
    meta?: CapiFanoutResult
    google?: CapiFanoutResult
    linkedin?: CapiFanoutResult
    tiktok?: CapiFanoutResult
  }
}

/**
 * Fanout orchestrator for server-side conversion events.
 *
 * Steps:
 * 1. Idempotency gate — skip if already processed.
 * 2. Find applicable pixel config (property-scoped first, then org-wide).
 * 3. Hash raw PII via SHA-256 (Meta spec: lowercase + trim).
 * 4. Fan out to each configured provider. Phase 6: Meta live; google/linkedin/tiktok skipped.
 * 5. Persist hashed event + fanout result to ad_capi_events. PII never written.
 * 6. Return TrackResult.
 */
export async function trackConversion(args: {
  orgId: string
  input: CapiEventInput
}): Promise<TrackResult> {
  const { wasEventProcessed, recordCapiEvent } = await import('@/lib/ads/capi-events/store')

  // 1. Idempotency gate
  if (await wasEventProcessed(args.orgId, args.input.event_id)) {
    return { event_id: args.input.event_id, alreadyProcessed: true, fanout: {} }
  }

  // 2. Find applicable config
  const { listPixelConfigs, decryptPlatformCapiToken } = await import(
    '@/lib/ads/pixel-configs/store'
  )

  let config: AdPixelConfig | null = null

  if (args.input.property_id) {
    const list = await listPixelConfigs({
      orgId: args.orgId,
      propertyId: args.input.property_id,
    })
    config = list[0] ?? null
  }

  if (!config) {
    const list = await listPixelConfigs({ orgId: args.orgId })
    config = list[0] ?? null
  }

  if (!config) {
    throw new Error(`No pixel config found for org ${args.orgId}`)
  }

  // 3. Hash PII — never store raw user data
  const userHash = hashUser(args.input.user)

  const fanout: TrackResult['fanout'] = {}

  // 4. Meta fanout (Phase 6 — live)
  if (config.meta?.pixelId && config.meta.capiTokenEnc) {
    try {
      const { sendMetaCapiEvent } = await import('@/lib/ads/providers/meta/capi')
      const token = decryptPlatformCapiToken(config, 'meta')
      const result = await sendMetaCapiEvent({
        pixelId: config.meta.pixelId,
        accessToken: token,
        testEventCode: config.meta.testEventCode,
        event: { ...args.input, userHash },
      })
      fanout.meta = {
        status: 'sent',
        metaResponseId: result.eventsReceived != null ? String(result.eventsReceived) : undefined,
        sentAt: Timestamp.now(),
      }
    } catch (err) {
      fanout.meta = {
        status: 'failed',
        error: (err as Error).message,
        sentAt: Timestamp.now(),
      }
    }
  }

  // Google / LinkedIn / TikTok — Phase 6 skipped (providers not yet implemented)
  for (const platform of ['google', 'linkedin', 'tiktok'] as const) {
    if (config[platform]?.pixelId) {
      fanout[platform] = { status: 'skipped', sentAt: Timestamp.now() }
    }
  }

  // 5. Persist hashed event log
  await recordCapiEvent({
    event_id: args.input.event_id,
    orgId: args.orgId,
    pixelConfigId: config.id,
    propertyId: args.input.property_id,
    eventName: args.input.event_name,
    eventTime: Timestamp.fromMillis(args.input.event_time * 1000),
    userHash,
    customData: args.input.custom_data,
    actionSource: args.input.action_source,
    eventSourceUrl: args.input.event_source_url,
    optOut: args.input.opt_out ?? false,
    fanout,
  })

  // 6. Return result
  return { event_id: args.input.event_id, alreadyProcessed: false, fanout }
}
