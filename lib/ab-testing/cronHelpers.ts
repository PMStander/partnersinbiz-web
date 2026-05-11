// lib/ab-testing/cronHelpers.ts
//
// Helpers for the cron workers that actually send emails (broadcasts and
// sequences). These functions are the integration surface — the cron loop
// asks `pickVariantForSend` what variant a contact should receive, the
// webhook calls `incrementVariantStat` to roll up opens/clicks, and the
// finalize / dispatch helpers handle winner promotion.
//
// All functions are SAFE TO CALL CONCURRENTLY: stat increments use
// FieldValue.increment; winner finalization is idempotent (re-running on an
// already-finalized config is a no-op).
//
// === Integration points ===
//
// 1) /app/api/cron/sequences/route.ts — inside the for-loop over due
//    enrollments, BEFORE calling sendCampaignEmail():
//
//      const ab = (step.ab ?? null) as AbConfig | null
//      const subjectId = `${enrollment.sequenceId}:${enrollment.currentStep}`
//      const pick = pickVariantForSend({
//        contactId: enrollment.contactId,
//        subjectId,
//        ab,
//      })
//      if (pick.defer) { /* skip — winner-only test cohort excludes this contact */ continue }
//      const variant = pick.variant
//      const effective = applyVariantOverrides({
//        subject: interpolatedSubject,
//        bodyHtml: interpolatedHtml,
//        bodyText: interpolatedText,
//        fromName: resolved.fromName,
//        scheduledFor: null,
//      }, variant)
//      // …then send `effective` instead of the raw interpolated content,
//      // and set `variantId: variant?.id ?? ''` on the emails doc, and call
//      //   await incrementVariantStat({
//      //     targetCollection: 'sequences', targetId: enrollment.sequenceId,
//      //     stepNumber: enrollment.currentStep, variantId: variant?.id ?? '',
//      //     field: 'sent',
//      //   })
//      // on successful send.
//
// 2) The (upcoming) /app/api/cron/broadcasts/route.ts loop should follow the
//    same pattern, plus call `maybeFinalizeWinner` once per tick for any
//    broadcasts in `testing` status whose `testEndsAt` has passed, then call
//    `dispatchWinnerToRemaining` for broadcasts in `winner-pending` status.
//
// 3) /app/api/v1/email/webhook/route.ts — see WEBHOOK-PATCH.md.

import { adminDb } from '@/lib/firebase/admin'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import type { AbConfig, Variant } from './types'
import { assignVariant, assignForWinnerOnly } from './assign'
import { selectWinner, selectWinnerWithSignificance } from './winner'

// How long to extend `testEndsAt` when we can't yet declare a significant
// winner. The cron retries this finalizer on every tick, so each extension
// effectively means "check again in 6 hours". The hard cap (7d total) avoids
// running tests forever when neither variant ever pulls ahead.
const EXTEND_TEST_WINDOW_MS = 6 * 60 * 60 * 1000
const MAX_TEST_DURATION_MS = 7 * 24 * 60 * 60 * 1000

export type AbTargetCollection = 'broadcasts' | 'sequences'
export type VariantStatField = 'sent' | 'delivered' | 'opened' | 'clicked' | 'bounced' | 'unsubscribed'

export interface PickVariantArgs {
  contactId: string
  subjectId: string             // broadcast.id, or `${sequenceId}:${stepNumber}`
  ab: AbConfig | null | undefined
}

export interface PickVariantResult {
  variant: Variant | null
  defer: boolean                // true => caller must skip this contact for now
}

/**
 * Single entry point the senders call before queuing a send. Decides which
 * variant a contact should receive, given the current A/B config. Returns
 * `{ variant: null, defer: false }` when A/B is disabled — the caller then
 * sends the base content as usual.
 */
export function pickVariantForSend({ contactId, subjectId, ab }: PickVariantArgs): PickVariantResult {
  if (!ab || !ab.enabled || ab.variants.length === 0) {
    return { variant: null, defer: false }
  }

  if (ab.mode === 'split') {
    return { variant: assignVariant(contactId, subjectId, ab.variants), defer: false }
  }

  // winner-only
  return assignForWinnerOnly(contactId, subjectId, ab)
}

export interface IncrementStatArgs {
  targetCollection: AbTargetCollection
  targetId: string              // broadcast id, or sequence id
  stepNumber?: number           // required when targetCollection === 'sequences'
  variantId: string             // "" → no-op
  field: VariantStatField
}

/**
 * Atomically bump a stat on the matching variant. Operates on the parent doc
 * (broadcast or sequence) — reads to locate the variant index, then issues a
 * FieldValue.increment update on the precise array slot.
 *
 * Concurrency: locating the variant index by id is stable across writes
 * (variant ids don't change). Two webhook deliveries hitting the same
 * variant at the same time both succeed because they use FieldValue.increment.
 */
export async function incrementVariantStat(args: IncrementStatArgs): Promise<boolean> {
  if (!args.variantId) return false
  const { targetCollection, targetId, stepNumber, variantId, field } = args

  const docRef = adminDb.collection(targetCollection).doc(targetId)
  const snap = await docRef.get()
  if (!snap.exists) return false
  const data = snap.data() ?? {}

  let variants: Variant[] | undefined
  let updatePath: string

  if (targetCollection === 'broadcasts') {
    const ab = data.ab as AbConfig | undefined
    variants = ab?.variants
    // path: ab.variants.<index>.<field>
    const idx = variants?.findIndex((v) => v.id === variantId) ?? -1
    if (idx < 0) return false
    updatePath = `ab.variants.${idx}.${field}`
  } else {
    // sequences — variants live inside steps[stepNumber].ab.variants
    if (typeof stepNumber !== 'number') return false
    const steps = (data.steps as Array<{ ab?: AbConfig }> | undefined) ?? []
    const step = steps[stepNumber]
    variants = step?.ab?.variants
    const idx = variants?.findIndex((v) => v.id === variantId) ?? -1
    if (idx < 0) return false
    updatePath = `steps.${stepNumber}.ab.variants.${idx}.${field}`
  }

  await docRef.update({
    [updatePath]: FieldValue.increment(1),
    updatedAt: FieldValue.serverTimestamp(),
  })
  return true
}

export interface FinalizeWinnerArgs {
  targetCollection: AbTargetCollection
  targetId: string
  stepNumber?: number
  ab: AbConfig
}

/**
 * If the test window has elapsed and the config is in `testing` with
 * `autoPromote = true`, picks the winner via `selectWinner` and transitions
 * status to `winner-pending`. Idempotent — does nothing if already past
 * winner-pending or if `testEndsAt` is in the future.
 *
 * Returns the new status if it changed, else null.
 */
export async function maybeFinalizeWinner(args: FinalizeWinnerArgs): Promise<string | null> {
  const { targetCollection, targetId, stepNumber, ab } = args

  if (!ab.enabled) return null
  if (ab.status !== 'testing') return null
  if (!ab.autoPromote) return null
  if (!ab.testEndsAt) return null
  if (ab.testEndsAt.toMillis() > Date.now()) return null

  // Use the statistical significance picker — never auto-promote a winner
  // chosen on noise. If the test isn't significant yet, extend the window
  // up to a hard cap so the operator can intervene.
  const result = selectWinnerWithSignificance(ab.variants, ab.winnerMetric)
  const prefix = targetCollection === 'broadcasts' ? 'ab' : `steps.${stepNumber}.ab`
  const now = FieldValue.serverTimestamp()

  if (result.reason !== 'significant' || !result.winner) {
    // Insufficient data or tie — extend testEndsAt by EXTEND_TEST_WINDOW_MS,
    // bounded by MAX_TEST_DURATION_MS from the original testStartedAt.
    const startedMs = ab.testStartedAt ? ab.testStartedAt.toMillis() : Date.now()
    const cap = startedMs + MAX_TEST_DURATION_MS
    const proposed = Date.now() + EXTEND_TEST_WINDOW_MS
    if (proposed <= cap) {
      await adminDb.collection(targetCollection).doc(targetId).update({
        [`${prefix}.testEndsAt`]: Timestamp.fromMillis(proposed),
        updatedAt: now,
      })
      return null
    }
    // Cap reached — fall back to the original "highest count" picker so a
    // long-running test eventually produces a result.
    const fallback = selectWinner(ab.variants, ab.winnerMetric)
    if (!fallback) return null
    const updates: Record<string, unknown> = {}
    updates[`${prefix}.winnerVariantId`] = fallback.id
    updates[`${prefix}.winnerDecidedAt`] = now
    updates[`${prefix}.status`] = 'winner-pending'
    updates['updatedAt'] = now
    await adminDb.collection(targetCollection).doc(targetId).update(updates)
    return 'winner-pending'
  }

  const updates: Record<string, unknown> = {}
  updates[`${prefix}.winnerVariantId`] = result.winner.id
  updates[`${prefix}.winnerDecidedAt`] = now
  updates[`${prefix}.status`] = 'winner-pending'
  updates['updatedAt'] = now

  await adminDb.collection(targetCollection).doc(targetId).update(updates)
  return 'winner-pending'
}

export interface DispatchWinnerArgs {
  broadcastId: string
  ab: AbConfig
}

/**
 * Winner-only fan-out: queues a send for every audience contact that was
 * deferred during the test (i.e. NOT in the test cohort). Writes pending
 * `broadcast_recipients` entries that the broadcast cron picks up on its
 * next tick.
 *
 * The contract with the broadcast slice:
 *   - `broadcasts/<id>` has an `audience.contactIds: string[]` field
 *     (or — if not yet defined — falls back to nothing and logs).
 *   - For each contactId where `assignForWinnerOnly(...).defer === true`,
 *     write a doc in `broadcast_recipients` with shape:
 *         { broadcastId, contactId, status: 'pending', variantId: winner.id }
 *   - The cron worker reads pending recipients and sends them with the
 *     winner variant.
 *
 * If the broadcast doc has no audience field yet (parallel slice not ready),
 * this function logs and returns `{ queued: 0 }` — safe no-op.
 */
export async function dispatchWinnerToRemaining(
  args: DispatchWinnerArgs,
): Promise<{ queued: number; skipped: number }> {
  const { broadcastId, ab } = args
  if (!ab.winnerVariantId) return { queued: 0, skipped: 0 }

  const winner = ab.variants.find((v) => v.id === ab.winnerVariantId)
  if (!winner) return { queued: 0, skipped: 0 }

  const broadcastSnap = await adminDb.collection('broadcasts').doc(broadcastId).get()
  if (!broadcastSnap.exists) return { queued: 0, skipped: 0 }
  const data = broadcastSnap.data() ?? {}
  const contactIds: string[] =
    (data.audience?.contactIds as string[] | undefined) ??
    (data.contactIds as string[] | undefined) ??
    []

  if (contactIds.length === 0) {
    // Parallel slice hasn't populated audience yet — nothing we can do.
    console.warn('[ab/dispatch] broadcast', broadcastId, 'has no audience.contactIds — skipping')
    return { queued: 0, skipped: 0 }
  }

  let queued = 0
  let skipped = 0
  const subjectId = broadcastId
  const recipientsCol = adminDb.collection('broadcast_recipients')

  for (const contactId of contactIds) {
    const pick = assignForWinnerOnly(contactId, subjectId, ab)
    // We only queue contacts who were DEFERRED during testing (i.e. were
    // outside the test cohort). Contacts inside the cohort were already sent
    // a variant during the test phase.
    if (!pick.defer) {
      skipped++
      continue
    }

    // Idempotency: if a recipient row already exists for (broadcastId, contactId),
    // don't double-queue. Cheap check using a deterministic doc id.
    const recipId = `${broadcastId}_${contactId}`
    const existing = await recipientsCol.doc(recipId).get()
    if (existing.exists) {
      skipped++
      continue
    }
    await recipientsCol.doc(recipId).set({
      broadcastId,
      contactId,
      status: 'pending',
      variantId: winner.id,
      queuedAt: FieldValue.serverTimestamp(),
    })
    queued++
  }

  // Mark broadcast as winner-sent (queue handed off).
  await adminDb.collection('broadcasts').doc(broadcastId).update({
    'ab.status': 'winner-sent',
    updatedAt: FieldValue.serverTimestamp(),
  })

  return { queued, skipped }
}

/**
 * Convenience: starts a winner-only test window. Used by the start route.
 */
export function makeTestWindow(durationMinutes: number): { startedAt: Timestamp; endsAt: Timestamp } {
  const now = Timestamp.now()
  const ends = Timestamp.fromMillis(now.toMillis() + durationMinutes * 60_000)
  return { startedAt: now, endsAt: ends }
}
