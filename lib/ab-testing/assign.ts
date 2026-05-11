// lib/ab-testing/assign.ts
//
// Deterministic variant assignment.
//
// Same (contactId, subjectId) ALWAYS maps to the same variant so re-running
// the cron/sender doesn't double-send a contact a different variant. Uses
// SHA-256(contactId + ':' + subjectId), takes the first 8 bytes as an unsigned
// integer, then mod 100 → walks the cumulative weight ladder.
import { createHash } from 'crypto'
import type { AbConfig, Variant } from './types'

const SALT = 'pib-ab-v1' // not secret — just disambiguates from other hashes

function hashBucket(contactId: string, subjectId: string): number {
  const h = createHash('sha256').update(`${SALT}:${contactId}:${subjectId}`).digest()
  // First 4 bytes as an unsigned int (sufficient entropy; staying under 2^32-1).
  const n = (h[0] << 24) | (h[1] << 16) | (h[2] << 8) | h[3]
  // Force unsigned then mod 100.
  return (n >>> 0) % 100
}

/**
 * Splits the variants pool by cumulative weight. Returns the variant whose
 * range contains `bucket`. If weights don't quite sum to 100 we still cover
 * the bucket by clamping to the last variant.
 */
function pickFromBucket(variants: Variant[], bucket: number): Variant | null {
  if (variants.length === 0) return null
  const totalWeight = variants.reduce((acc, v) => acc + Math.max(0, v.weight), 0)
  if (totalWeight <= 0) return null
  // Scale bucket against actual total so weights that sum to e.g. 99 still work.
  const scaled = (bucket / 100) * totalWeight
  let acc = 0
  for (const v of variants) {
    acc += Math.max(0, v.weight)
    if (scaled < acc) return v
  }
  return variants[variants.length - 1]
}

/**
 * Deterministically assigns a contact to a variant.
 * Pure function — no I/O. Same contactId+subjectId+variant set → same result.
 */
export function assignVariant(
  contactId: string,
  subjectId: string,
  variants: Variant[],
): Variant | null {
  if (!variants || variants.length === 0) return null
  const bucket = hashBucket(contactId, subjectId)
  return pickFromBucket(variants, bucket)
}

/**
 * Winner-only mode assigner. Before the winner is decided only the test
 * cohort (`testCohortPercent`) sees a variant — the rest are deferred until
 * the winner is picked and `dispatchWinnerToRemaining` queues them.
 *
 * After the winner is decided (`winnerVariantId` populated), ALL contacts
 * resolve to the winner. (The dispatch worker still handles the actual
 * send-to-remaining hand-off; this function tells the sender which variant
 * to use for an individual contact.)
 */
export function assignForWinnerOnly(
  contactId: string,
  subjectId: string,
  ab: AbConfig,
): { variant: Variant | null; defer: boolean } {
  if (!ab.enabled || ab.variants.length === 0) {
    return { variant: null, defer: false }
  }

  // Winner already decided — everyone gets the winner.
  if (ab.winnerVariantId) {
    const winner = ab.variants.find((v) => v.id === ab.winnerVariantId) ?? null
    return { variant: winner, defer: false }
  }

  // Cohort gating. Determine if this contact is in the test cohort using a
  // separate hash bucket so it's independent of the variant assignment hash.
  const cohortBucket = hashBucket(contactId, `${subjectId}:cohort`)
  const inCohort = cohortBucket < Math.max(0, Math.min(100, ab.testCohortPercent))

  if (!inCohort) {
    // Defer — caller should NOT send yet. The winner dispatcher will queue
    // this contact once a winner is picked.
    return { variant: null, defer: true }
  }

  // In cohort → assign by weight as usual.
  return { variant: assignVariant(contactId, subjectId, ab.variants), defer: false }
}
