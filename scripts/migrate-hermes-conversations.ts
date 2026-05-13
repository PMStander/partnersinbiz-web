/**
 * One-shot migration: hermes_conversations → conversations
 *
 * Copies every document (and its messages subcollection) from the old
 * hermes_conversations collection into the new unified conversations collection
 * using the Phase-1 schema.
 *
 * Safe to re-run: any conversation whose ID already exists in conversations
 * is skipped without modification.
 *
 * Usage:
 *   npx tsx scripts/migrate-hermes-conversations.ts          # real run
 *   npx tsx scripts/migrate-hermes-conversations.ts --dry-run # preview only
 *
 * Requires .env.local with Firebase Admin vars.
 */

import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

// ---------------------------------------------------------------------------
// Load .env.local before importing firebase-admin
// ---------------------------------------------------------------------------
;(function loadEnv() {
  const envPath = resolve(process.cwd(), '.env.local')
  if (!existsSync(envPath)) return
  const raw = readFileSync(envPath, 'utf-8')
  const lines = raw.split('\n')
  let currentKey = ''
  let currentVal = ''
  let inMultiline = false

  for (const line of lines) {
    if (inMultiline) {
      currentVal += '\n' + line
      if (line.includes('"')) {
        inMultiline = false
        const val = currentVal.replace(/^"|"$/g, '').replace(/\\n/g, '\n')
        if (!process.env[currentKey]) process.env[currentKey] = val
        currentKey = ''
        currentVal = ''
      }
      continue
    }

    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue

    const key = trimmed.slice(0, eqIdx).trim()
    let val = trimmed.slice(eqIdx + 1).trim()

    if (val.startsWith('"') && !val.slice(1).includes('"')) {
      currentKey = key
      currentVal = val
      inMultiline = true
      continue
    }

    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }

    if (!process.env[key]) process.env[key] = val
  }
})()

// ---------------------------------------------------------------------------
// Types (inlined to keep this script self-contained)
// ---------------------------------------------------------------------------
import type { Timestamp } from 'firebase-admin/firestore'
import type { HermesConversation, HermesMessage } from '@/lib/hermes/conversations'
import type {
  Conversation,
  ConversationMessage,
  HumanParticipant,
  AgentParticipant,
  ConversationScope,
} from '@/lib/conversations/types'
import type { AgentId } from '@/lib/agents/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert HermesMessage.role → Conversation.lastMessageRole */
function toLastMessageRole(role: string): Conversation['lastMessageRole'] {
  if (role === 'assistant') return 'agent'
  // 'user' | 'system' | 'tool' pass through
  return role as Conversation['lastMessageRole']
}

/** Convert hermes scope → ConversationScope */
function toScope(conv: HermesConversation): ConversationScope {
  return conv.scope === 'project' ? 'project' : 'general'
}

/** Firestore Batch limit is 500 operations */
const BATCH_SIZE = 499

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const dryRun = process.argv.includes('--dry-run')

  const { adminDb } = await import('@/lib/firebase/admin')

  console.log(`Migrating hermes_conversations → conversations${dryRun ? ' [DRY RUN]' : ''}`)
  console.log()

  // -------------------------------------------------------------------------
  // 1. Pre-fetch agent names from agent_team
  // -------------------------------------------------------------------------
  const agentNames = new Map<string, string>()
  const agentTeamSnap = await adminDb.collection('agent_team').get()
  for (const doc of agentTeamSnap.docs) {
    const data = doc.data() as { name?: string }
    agentNames.set(doc.id, data.name ?? doc.id)
  }

  // -------------------------------------------------------------------------
  // 2. Fetch all hermes_conversations
  // -------------------------------------------------------------------------
  const hermesSnap = await adminDb.collection('hermes_conversations').get()
  if (hermesSnap.empty) {
    console.log('hermes_conversations is empty — nothing to migrate.')
    return
  }

  const hermesConvs = hermesSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as HermesConversation)
  console.log(`Found ${hermesConvs.length} hermes_conversations docs.`)
  console.log()

  // -------------------------------------------------------------------------
  // 3. Pre-fetch user display names (one batch, not N+1)
  // -------------------------------------------------------------------------
  const uniqueOwnerUids = [...new Set(hermesConvs.map((c) => c.ownerUid).filter(Boolean))]
  const userDisplayNames = new Map<string, string>()

  for (const uid of uniqueOwnerUids) {
    try {
      const userDoc = await adminDb.collection('users').doc(uid).get()
      if (userDoc.exists) {
        const data = userDoc.data() as { displayName?: string; email?: string }
        userDisplayNames.set(uid, data.displayName || data.email || uid)
      } else {
        userDisplayNames.set(uid, uid)
      }
    } catch {
      // Non-fatal: fall back to uid
      userDisplayNames.set(uid, uid)
    }
  }

  // -------------------------------------------------------------------------
  // 4. Check which conversations already exist in the destination
  // -------------------------------------------------------------------------
  const existingIds = new Set<string>()
  // Firestore `in` queries are limited to 30 items; chunk if needed
  const idChunks: string[][] = []
  for (let i = 0; i < hermesConvs.length; i += 30) {
    idChunks.push(hermesConvs.slice(i, i + 30).map((c) => c.id))
  }

  for (const chunk of idChunks) {
    const snap = await adminDb
      .collection('conversations')
      .where('__name__', 'in', chunk)
      .select() // fetch only metadata
      .get()
    for (const doc of snap.docs) existingIds.add(doc.id)
  }

  // -------------------------------------------------------------------------
  // 5. Migrate each conversation
  // -------------------------------------------------------------------------
  let migrated = 0
  let skipped = 0

  for (const conv of hermesConvs) {
    if (existingIds.has(conv.id)) {
      console.log(`  skip ${conv.id} (already migrated)`)
      skipped++
      continue
    }

    const agentName = agentNames.get(conv.profile) ?? conv.profile
    const ownerDisplayName = userDisplayNames.get(conv.ownerUid) ?? conv.ownerUid

    if (dryRun) {
      console.log(
        `  would migrate ${conv.id} — title: "${conv.title}", owner: ${conv.ownerUid}, agent: ${conv.profile}`,
      )
      migrated++
      continue
    }

    // -----------------------------------------------------------------------
    // Build the Conversation document
    // -----------------------------------------------------------------------
    const humanParticipant: HumanParticipant = {
      kind: 'user',
      uid: conv.ownerUid,
      role: 'admin',
      displayName: ownerDisplayName,
    }

    const agentParticipant: AgentParticipant = {
      kind: 'agent',
      agentId: conv.profile as AgentId,
      name: agentName,
    }

    // Build a plain object that matches the Conversation interface.
    // We cast `as Conversation` after; all fields are explicitly set.
    const destConv: Omit<Conversation, 'id'> = {
      orgId: conv.orgId,
      participants: [humanParticipant, agentParticipant],
      participantUids: [conv.ownerUid],
      participantAgentIds: [conv.profile as AgentId],
      startedBy: conv.ownerUid,
      title: conv.title,
      scope: toScope(conv),
      ...(conv.projectId ? { scopeRefId: conv.projectId } : {}),
      ...(conv.lastMessagePreview !== undefined ? { lastMessagePreview: conv.lastMessagePreview } : {}),
      ...(conv.lastMessageRole !== undefined ? { lastMessageRole: toLastMessageRole(conv.lastMessageRole) } : {}),
      // Pass through Timestamp values directly; don't wrap in serverTimestamp()
      ...(conv.lastMessageAt !== undefined ? { lastMessageAt: conv.lastMessageAt as Timestamp } : {}),
      messageCount: conv.messageCount ?? 0,
      archived: conv.archived ?? false,
      migratedFromHermes: true,
      ...(conv.createdAt !== undefined ? { createdAt: conv.createdAt as Timestamp } : {}),
      ...(conv.updatedAt !== undefined ? { updatedAt: conv.updatedAt as Timestamp } : {}),
    }

    // Write the conversation doc
    await adminDb.collection('conversations').doc(conv.id).set(destConv)

    // -----------------------------------------------------------------------
    // Migrate messages subcollection
    // -----------------------------------------------------------------------
    const messagesSnap = await adminDb
      .collection('hermes_conversations')
      .doc(conv.id)
      .collection('messages')
      .orderBy('createdAt', 'asc')
      .get()

    if (!messagesSnap.empty) {
      // Process messages in batches of BATCH_SIZE
      const msgs = messagesSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as HermesMessage)

      for (let batchStart = 0; batchStart < msgs.length; batchStart += BATCH_SIZE) {
        const batch = adminDb.batch()
        const slice = msgs.slice(batchStart, batchStart + BATCH_SIZE)

        for (const msg of slice) {
          const isUserMsg = msg.role === 'user'
          const isSystemMsg = msg.role === 'system'
          // authorKind: 'user' for human turns, 'system' for system prompts, 'agent' for assistant/tool
          const authorKind: ConversationMessage['authorKind'] = isUserMsg
            ? 'user'
            : isSystemMsg
              ? 'system'
              : 'agent'
          const authorId = isUserMsg ? (msg.createdBy ?? conv.ownerUid) : conv.profile
          let authorDisplayName: string

          if (isUserMsg) {
            const createdBy = msg.createdBy ?? conv.ownerUid
            authorDisplayName = userDisplayNames.get(createdBy) ?? createdBy
          } else if (isSystemMsg) {
            authorDisplayName = 'system'
          } else {
            // assistant / tool — attribute to the agent
            authorDisplayName = agentName
          }

          const destMsg: Omit<ConversationMessage, 'id'> = {
            conversationId: conv.id,
            role: msg.role,
            content: msg.content ?? '',
            authorKind,
            authorId,
            authorDisplayName,
            ...(msg.runId !== undefined ? { runId: msg.runId } : {}),
            ...(msg.status !== undefined ? { status: msg.status } : {}),
            ...(msg.error !== undefined ? { error: msg.error } : {}),
            ...(msg.events !== undefined ? { events: msg.events } : {}),
            ...(msg.toolName !== undefined ? { toolName: msg.toolName } : {}),
            // Pass Timestamp through; don't re-wrap
            ...(msg.createdAt !== undefined ? { createdAt: msg.createdAt as Timestamp } : {}),
          }

          const msgRef = adminDb
            .collection('conversations')
            .doc(conv.id)
            .collection('messages')
            .doc(msg.id)

          batch.set(msgRef, destMsg)
        }

        await batch.commit()
      }
    }

    console.log(
      `  migrated ${conv.id} — title: "${conv.title}", owner: ${conv.ownerUid}, agent: ${conv.profile}` +
        (messagesSnap.size > 0 ? ` (${messagesSnap.size} messages)` : ' (no messages)'),
    )
    migrated++
  }

  // -------------------------------------------------------------------------
  // 6. Summary
  // -------------------------------------------------------------------------
  console.log()
  console.log(`Done. ${migrated} migrated, ${skipped} skipped.`)
  if (dryRun) {
    console.log('(Dry run — nothing was written. Re-run without --dry-run to apply.)')
  }
}

main().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
