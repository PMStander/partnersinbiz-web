/**
 * Inbox poller orchestrator — fetches engagement from all connected social accounts
 * and stores new items in Firestore with deduplication.
 */

import { FieldValue, Timestamp, Query } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { decryptTokenBlock } from './encryption'
import { pollPlatform, type InboxPollResult } from './inbox-poller'

export interface InboxPollStats {
  polled: number
  newItems: number
  errors: string[]
}

/**
 * Main polling orchestrator.
 * @param orgId Optional — if provided, only polls accounts for that org. Otherwise polls all.
 */
export async function runInboxPoll(orgId?: string): Promise<InboxPollStats> {
  const stats: InboxPollStats = {
    polled: 0,
    newItems: 0,
    errors: [],
  }

  try {
    // Query social_accounts
    const base = adminDb.collection('social_accounts')
    let query: FirebaseFirestore.Query = base

    if (orgId) {
      query = query.where('orgId', '==', orgId)
    }

    const accountsSnap = await (query as any)
      .where('status', '==', 'active')
      .get()

    for (const accountDoc of accountsSnap.docs) {
      const account = accountDoc.data() as {
        orgId: string
        platform: string
        platformAccountId: string
        username: string
        displayName: string
        encryptedTokens: {
          accessToken: string
          iv: string
          tag: string
        }
      }

      stats.polled++

      try {
        // Decrypt the access token
        let accessToken: string
        try {
          const decrypted = decryptTokenBlock(
            {
              accessToken: account.encryptedTokens.accessToken,
              iv: account.encryptedTokens.iv,
              tag: account.encryptedTokens.tag,
            },
            account.orgId,
          )
          accessToken = decrypted.accessToken
        } catch (decryptErr) {
          console.error(`[inbox-poll] Failed to decrypt token for account ${accountDoc.id}:`, decryptErr)
          stats.errors.push(`Decryption failed for ${account.username}`)
          continue
        }

        // Poll the platform
        const results = await pollPlatform(account.platform, {
          platformAccountId: account.platformAccountId,
          accessToken,
          username: account.username,
        })

        // Write new items to Firestore with deduplication
        for (const result of results) {
          // Check if this item already exists
          const existingSnap = await (adminDb.collection('social_inbox') as any)
            .where('orgId', '==', account.orgId)
            .where('platformItemId', '==', result.platformItemId)
            .limit(1)
            .get()

          if (existingSnap.docs.length > 0) {
            // Item already exists, skip
            continue
          }

          // Insert new item
          await adminDb.collection('social_inbox').add({
            orgId: account.orgId,
            platform: account.platform,
            type: result.type,
            fromUser: result.fromUser,
            content: result.content,
            postId: result.postId,
            platformItemId: result.platformItemId,
            platformUrl: result.platformUrl,
            status: 'unread',
            priority: 'normal',
            sentiment: null,
            createdAt: Timestamp.fromDate(result.createdAt),
            updatedAt: FieldValue.serverTimestamp(),
          })

          stats.newItems++
        }
      } catch (error) {
        console.error(`[inbox-poll] Error polling account ${account.username}:`, error)
        stats.errors.push(`${account.username}: ${String(error)}`)
      }
    }
  } catch (error) {
    console.error('[inbox-poll] Fatal error:', error)
    stats.errors.push(`Fatal: ${String(error)}`)
  }

  return stats
}
