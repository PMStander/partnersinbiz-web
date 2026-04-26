// lib/integrations/dispatch.ts
//
// Single dispatcher for daily integration pulls. Loops over all `connected`
// connections that haven't been pulled today and runs each provider's
// `pullDaily()` adapter. Records success / failure per connection.
//
// Called by `/api/cron/integrations` once per hour.

import { listDueConnections, markPullSuccess, markPullFailure } from './connections'
import { getAdapter } from './registry'
import type { Connection } from './types'

export interface DispatchSummary {
  total: number
  ok: number
  failed: number
  skipped: number
  byProvider: Record<string, { ok: number; failed: number; skipped: number }>
  errors: Array<{ propertyId: string; provider: string; error: string }>
}

const empty = (): DispatchSummary => ({
  total: 0,
  ok: 0,
  failed: 0,
  skipped: 0,
  byProvider: {},
  errors: [],
})

function bumpProvider(summary: DispatchSummary, provider: string, kind: 'ok' | 'failed' | 'skipped') {
  if (!summary.byProvider[provider]) {
    summary.byProvider[provider] = { ok: 0, failed: 0, skipped: 0 }
  }
  summary.byProvider[provider][kind] += 1
}

/** Run one connection through its adapter. */
async function runOne(connection: Connection, summary: DispatchSummary): Promise<void> {
  summary.total += 1
  const adapter = getAdapter(connection.provider)
  if (!adapter) {
    summary.skipped += 1
    bumpProvider(summary, connection.provider, 'skipped')
    return
  }
  try {
    const result = await adapter.pullDaily({ connection })
    await markPullSuccess({
      propertyId: connection.propertyId,
      provider: connection.provider,
      backfilledThrough: result.to,
    })
    summary.ok += 1
    bumpProvider(summary, connection.provider, 'ok')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await markPullFailure({
      propertyId: connection.propertyId,
      provider: connection.provider,
      error: message,
    })
    summary.failed += 1
    summary.errors.push({
      propertyId: connection.propertyId,
      provider: connection.provider,
      error: message,
    })
    bumpProvider(summary, connection.provider, 'failed')
  }
}

/** Pull every due connection, grouped by provider with bounded concurrency. */
export async function dispatchAll(options: {
  today: string
  concurrency?: number
}): Promise<DispatchSummary> {
  const summary = empty()
  const due = await listDueConnections(options.today)
  const concurrency = Math.max(1, options.concurrency ?? 4)

  let i = 0
  async function worker() {
    while (i < due.length) {
      const idx = i
      i += 1
      const connection = due[idx]
      await runOne(connection, summary)
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()))

  return summary
}

/** Dispatch a single specific connection — useful for backfill or admin retry. */
export async function dispatchOne(connection: Connection): Promise<DispatchSummary> {
  const summary = empty()
  await runOne(connection, summary)
  return summary
}
