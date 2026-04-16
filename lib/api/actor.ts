import { FieldValue } from 'firebase-admin/firestore'
import type { ApiUser } from './types'

export type ActorType = 'user' | 'agent' | 'system'

export interface ActorInfo {
  createdBy: string
  createdByType: ActorType
}

/**
 * Returns creation-time actor fields for a Firestore write.
 *
 * `createdByType` is `agent` when the authenticated user has role `ai`,
 * otherwise `user`. `system` is reserved for platform writes made without
 * an authenticated user (e.g. cron jobs, internal migrations).
 */
export function actorFrom(user: ApiUser): ActorInfo {
  return {
    createdBy: user.uid,
    createdByType: user.role === 'ai' ? 'agent' : 'user',
  }
}

/**
 * Returns update-time actor fields (plus a server timestamp) for a
 * Firestore update. Pair with `actorFrom` on creates.
 */
export function lastActorFrom(user: ApiUser): {
  updatedBy: string
  updatedByType: ActorType
  updatedAt: FieldValue
} {
  return {
    updatedBy: user.uid,
    updatedByType: user.role === 'ai' ? 'agent' : 'user',
    updatedAt: FieldValue.serverTimestamp(),
  }
}
