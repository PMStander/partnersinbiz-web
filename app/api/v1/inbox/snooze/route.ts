/**
 * POST /api/v1/inbox/snooze — snooze a notification inbox item.
 *
 * Body: { itemId: string, until: ISO }
 * Only notification items can be snoozed; other item types derive their
 * state from the underlying resource.
 */
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'

export const dynamic = 'force-dynamic'

export const POST = withAuth('admin', async (req) => {
  const body = await req.json().catch(() => ({}))
  const { itemId, until } = body as { itemId?: string; until?: string }

  if (!itemId) return apiError('itemId is required', 400)
  if (!until) return apiError('until (ISO timestamp) is required', 400)

  const parsed = new Date(until)
  if (Number.isNaN(parsed.getTime())) {
    return apiError('until must be a valid ISO timestamp', 400)
  }

  try {
    const ref = adminDb.collection('notifications').doc(itemId)
    const doc = await ref.get()
    if (!doc.exists) return apiError('Notification not found', 404)

    const snoozedUntil = parsed.toISOString()
    await ref.update({
      status: 'snoozed',
      snoozedUntil,
    })
    return apiSuccess({ id: itemId, snoozedUntil })
  } catch (err) {
    console.error('[inbox-snooze-error]', err)
    return apiError('Failed to snooze item', 500)
  }
})
