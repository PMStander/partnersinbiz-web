// lib/broadcasts/ab.ts
//
// ADDITIVE TYPES — to be merged into lib/broadcasts/types.ts by the broadcast
// slice owner. Kept here separately because the broadcast slice is being
// built in parallel and may not yet expose a Broadcast interface.
//
// Once lib/broadcasts/types.ts exists, the broadcast agent should:
//   1. import { AbConfig } from '@/lib/ab-testing/types'
//   2. add `ab: AbConfig` to the Broadcast interface (default = EMPTY_AB on create)
//   3. delete this file
import type { AbConfig } from '@/lib/ab-testing/types'
import { EMPTY_AB } from '@/lib/ab-testing/types'

/**
 * Shape that broadcasts must expose for the A/B layer to work. This is a
 * structural subset — the eventual `Broadcast` interface only has to satisfy
 * this for ab routes / cron helpers to operate on it.
 */
export interface BroadcastWithAb {
  id: string
  orgId: string
  status: string  // see BroadcastStatus when defined
  ab: AbConfig
}

export const DEFAULT_BROADCAST_AB: AbConfig = EMPTY_AB
