// lib/ads/capi/test.ts
import type { CapiEventInput } from './types'
import { hashUser } from './hash'
import { sendMetaCapiEvent } from '@/lib/ads/providers/meta/capi'
import { getPixelConfig, decryptPlatformCapiToken } from '@/lib/ads/pixel-configs/store'

/**
 * Send a single synthetic conversion event with a testEventCode so Meta's
 * Events Manager routes it to the Test Events tab only — no production
 * attribution impact. Used by the admin UI "Send test event" button.
 */
export async function sendTestEvent(args: {
  pixelConfigId: string
  /** From Meta Events Manager → Test Events. Routes event to test tab only. */
  testEventCode: string
}): Promise<{ sent: boolean; metaEventsReceived?: number; error?: string }> {
  const config = await getPixelConfig(args.pixelConfigId)
  if (!config) {
    throw new Error(`Pixel config ${args.pixelConfigId} not found`)
  }
  if (!config.meta?.pixelId || !config.meta.capiTokenEnc) {
    throw new Error('No Meta CAPI token configured')
  }

  const accessToken = decryptPlatformCapiToken(config, 'meta')

  const testEvent: CapiEventInput = {
    event_id: `pib_test_${Date.now()}`,
    event_name: 'TestEvent',
    event_time: Math.floor(Date.now() / 1000),
    user: { email: 'test@example.com' },
    action_source: 'system_generated',
    opt_out: false,
  }

  try {
    const result = await sendMetaCapiEvent({
      pixelId: config.meta.pixelId,
      accessToken,
      testEventCode: args.testEventCode,
      event: { ...testEvent, userHash: hashUser(testEvent.user) },
    })
    return { sent: true, metaEventsReceived: result.eventsReceived }
  } catch (err) {
    return { sent: false, error: (err as Error).message }
  }
}
