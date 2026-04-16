/**
 * GET /api/cron/webhooks — process pending outbound webhook deliveries.
 *
 * Secured by `Authorization: Bearer ${CRON_SECRET}` (matches the existing
 * cron routes in `app/api/cron/*`). Vercel's platform cron also sets an
 * `x-vercel-cron` header which we accept as a secondary signal.
 *
 * Schedule (to be added to `vercel.json` — see `docs/vercel-cron-addition.md`):
 *   { "path": "/api/cron/webhooks", "schedule": "* * * * *" }  // every minute
 */
import { NextRequest } from 'next/server'
import { apiSuccess, apiError } from '@/lib/api/response'
import { processPendingWebhooks } from '@/lib/webhooks/worker'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const vercelCron = req.headers.get('x-vercel-cron')
  const authorized =
    auth === `Bearer ${process.env.CRON_SECRET}` || Boolean(vercelCron)
  if (!authorized) return apiError('Unauthorized', 401)

  try {
    const { processed, delivered, failed } = await processPendingWebhooks({
      maxBatch: 50,
    })
    return apiSuccess({ processed, delivered, failed })
  } catch (err) {
    console.error('[webhook-cron-error]', err)
    return apiError('Webhook worker failed', 500)
  }
}
