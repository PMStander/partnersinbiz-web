import { adminDb } from '@/lib/firebase/admin'
import { FieldValue } from 'firebase-admin/firestore'
import { pullDailyGscForSprint } from '@/lib/seo/integrations/gsc'
import { pullDailyBingForSprint } from '@/lib/seo/integrations/bing'
import { pullDailyPagespeedForSprint } from '@/lib/seo/integrations/pagespeed'
import type { SprintStatus } from '@/lib/seo/types'

const ACTIVE_STATUSES: SprintStatus[] = ['pre-launch', 'active', 'compounding']

export function computeWeek(startDate: string): { day: number; week: number; phase: 0 | 1 | 2 | 3 | 4 } {
  const start = new Date(startDate).getTime()
  const day = Math.max(0, Math.floor((Date.now() - start) / 86_400_000))
  const week = Math.floor(day / 7)
  let phase: 0 | 1 | 2 | 3 | 4 = 0
  if (day === 0) phase = 0
  else if (day <= 30) phase = 1
  else if (day <= 60) phase = 2
  else if (day <= 90) phase = 3
  else phase = 4
  return { day, week, phase }
}

export async function refreshTodayPlan(sprintId: string, week: number): Promise<void> {
  const tasksSnap = await adminDb
    .collection('seo_tasks')
    .where('sprintId', '==', sprintId)
    .where('deleted', '==', false)
    .get()
  const due: string[] = []
  const inProgress: string[] = []
  const blocked: { taskId: string; reason: string }[] = []
  for (const t of tasksSnap.docs) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = t.data() as any
    if (d.status === 'in_progress') inProgress.push(t.id)
    else if (d.status === 'blocked') blocked.push({ taskId: t.id, reason: d.blockerReason ?? 'unknown' })
    else if (d.status === 'not_started' && d.week <= week) due.push(t.id)
  }
  const optsSnap = await adminDb
    .collection('seo_optimizations')
    .where('sprintId', '==', sprintId)
    .where('status', '==', 'proposed')
    .get()
  await adminDb
    .collection('seo_sprints')
    .doc(sprintId)
    .update({
      todayPlan: {
        asOf: new Date().toISOString(),
        currentWeek: week,
        due,
        inProgress,
        blocked,
        optimizationProposals: optsSnap.docs.map((d) => d.id),
      },
    })
}

export async function runDailyLoop(): Promise<{ processed: number; errors: string[] }> {
  const errors: string[] = []
  const snap = await adminDb
    .collection('seo_sprints')
    .where('deleted', '==', false)
    .where('status', 'in', ACTIVE_STATUSES)
    .get()
  let processed = 0
  for (const s of snap.docs) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = s.data() as any
      await Promise.allSettled([
        pullDailyGscForSprint(s.id),
        pullDailyBingForSprint(s.id),
        pullDailyPagespeedForSprint(s.id),
      ])
      const { day, week, phase } = computeWeek(data.startDate)
      let status: SprintStatus = data.status
      if (status === 'pre-launch' && day >= 1) status = 'active'
      if (status === 'active' && day > 90) status = 'compounding'
      await s.ref.update({
        currentDay: day,
        currentWeek: week,
        currentPhase: phase,
        status,
        updatedAt: FieldValue.serverTimestamp(),
      })
      await refreshTodayPlan(s.id, week)
      processed++
    } catch (e) {
      errors.push(`${s.id}: ${(e as Error).message}`)
    }
  }
  return { processed, errors }
}
