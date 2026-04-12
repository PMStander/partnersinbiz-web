/**
 * GET /api/v1/social/ai/best-time — Get best posting times based on analytics
 */
import { withAuth } from '@/lib/api/auth'
import { withTenant } from '@/lib/api/tenant'
import { apiSuccess } from '@/lib/api/response'
import { calculateBestTimes } from '@/lib/social/analytics'

export const dynamic = 'force-dynamic'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export const GET = withAuth('admin', withTenant(async (req, _user, orgId) => {
  const { searchParams } = new URL(req.url)
  const platform = searchParams.get('platform') ?? undefined

  const slots = await calculateBestTimes(orgId, platform)

  // Enhance with human-readable labels
  const enhanced = slots.map(slot => ({
    ...slot,
    dayName: DAY_NAMES[slot.dayOfWeek],
    timeLabel: `${slot.hour.toString().padStart(2, '0')}:00`,
    label: `${DAY_NAMES[slot.dayOfWeek]} at ${slot.hour.toString().padStart(2, '0')}:00`,
  }))

  return apiSuccess({
    slots: enhanced,
    recommendation: enhanced.length > 0
      ? `Best time to post: ${enhanced[0].label} (avg engagement score: ${enhanced[0].avgScore}, based on ${enhanced[0].postCount} posts)`
      : 'Not enough data to recommend posting times yet. Keep publishing to build engagement history.',
  })
}))
