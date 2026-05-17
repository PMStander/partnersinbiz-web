// lib/ads/insights/worker.ts
import { listConnections, decryptAccessToken } from '@/lib/ads/connections/store'
import { claimPendingJobs, markJobDone, markJobFailed } from './queue'
import { refreshEntityInsights } from './refresh'

const BATCH_SIZE = 10 // process up to 10 jobs per cron tick

/** Drain pending refresh jobs. Returns count of jobs processed and failed. */
export async function drainRefreshQueue(): Promise<{ processed: number; failed: number }> {
  const jobs = await claimPendingJobs({ limit: BATCH_SIZE })
  if (jobs.length === 0) return { processed: 0, failed: 0 }

  // Group by orgId to load connection token once per org
  const byOrg = new Map<string, typeof jobs>()
  for (const j of jobs) {
    if (!byOrg.has(j.orgId)) byOrg.set(j.orgId, [])
    byOrg.get(j.orgId)!.push(j)
  }

  let processed = 0
  let failed = 0

  for (const [orgId, orgJobs] of byOrg) {
    let accessToken: string
    try {
      const conns = await listConnections({ orgId })
      const meta = conns.find((c) => c.platform === 'meta')
      if (!meta) {
        for (const j of orgJobs) {
          await markJobFailed(j.id, 'No Meta connection')
          failed++
        }
        continue
      }
      accessToken = decryptAccessToken(meta)
    } catch (err) {
      for (const j of orgJobs) {
        await markJobFailed(j.id, `Connection load failed: ${(err as Error).message}`)
        failed++
      }
      continue
    }

    for (const job of orgJobs) {
      try {
        await refreshEntityInsights({
          orgId: job.orgId,
          accessToken,
          metaObjectId: job.metaObjectId,
          level: job.level,
          pibEntityId: job.pibEntityId,
        })
        await markJobDone(job.id)
        processed++
      } catch (err) {
        await markJobFailed(job.id, (err as Error).message)
        failed++
      }
    }
  }

  return { processed, failed }
}
