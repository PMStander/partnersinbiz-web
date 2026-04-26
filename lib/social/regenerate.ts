/**
 * AI regeneration of a social post from rejection feedback.
 *
 * Flow:
 *   1. Caller transitions post to status="regenerating".
 *   2. regeneratePost(postId, orgId) loads the post + unresolved rejection comments.
 *   3. Calls Claude with original content + feedback to produce a revised draft.
 *   4. Writes the new content to the post, preserves originalContent (first time only),
 *      increments approval.regenerationCount, marks rejection comments as agentPickedUp.
 *   5. Transitions post back to qa_review (re-enters the gate).
 *   6. Posts an "agent_handoff" comment summarising what changed.
 */
import { generateText } from 'ai'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { BRIEF_MODEL } from '@/lib/ai/client'
import { logAudit } from '@/lib/social/audit'
import type { PostStatus, RejectionStage } from '@/lib/social/providers'

interface RegenerationFeedbackItem {
  commentId: string
  text: string
  stage: RejectionStage
  authorName: string
}

export interface RegenerateResult {
  postId: string
  newStatus: PostStatus
  oldText: string
  newText: string
  feedbackUsed: RegenerationFeedbackItem[]
  regenerationCount: number
}

/**
 * Look up unresolved rejection feedback for a post — comments with kind in
 * {qa_rejection, client_rejection} that haven't been picked up by the agent yet.
 */
async function loadUnresolvedFeedback(postId: string): Promise<RegenerationFeedbackItem[]> {
  const snap = await adminDb
    .collection('social_posts')
    .doc(postId)
    .collection('comments')
    .where('agentPickedUp', '==', false)
    .orderBy('createdAt', 'asc')
    .get()

  const items: RegenerationFeedbackItem[] = []
  for (const doc of snap.docs) {
    const d = doc.data()
    const kind = d.kind as string | undefined
    if (kind === 'qa_rejection' || kind === 'client_rejection') {
      items.push({
        commentId: doc.id,
        text: d.text as string,
        stage: kind === 'qa_rejection' ? 'qa' : 'client',
        authorName: (d.userName as string) ?? 'Reviewer',
      })
    }
  }
  return items
}

function buildRegenerationPrompt(opts: {
  originalText: string
  feedback: RegenerationFeedbackItem[]
  platform: string
}): { system: string; prompt: string } {
  const feedbackBullets = opts.feedback
    .map((f, i) => `${i + 1}. [${f.stage} review by ${f.authorName}] ${f.text}`)
    .join('\n')

  return {
    system: `You are a social media copywriter revising a post based on reviewer feedback. Output ONLY the revised post text — no explanations, no JSON wrapping, no quotation marks. Keep it on the original platform "${opts.platform}". Preserve the intent of the original where possible; address every piece of feedback.`,
    prompt: `Original post:
"""
${opts.originalText}
"""

Reviewer feedback to address (every point must be incorporated):
${feedbackBullets}

Output the revised post text only.`,
  }
}

export interface RegenerateInput {
  postId: string
  orgId: string
  actorUid: string
  actorRole: 'admin' | 'client' | 'ai' | 'system'
}

export async function regeneratePost(input: RegenerateInput): Promise<RegenerateResult> {
  const ref = adminDb.collection('social_posts').doc(input.postId)
  const snap = await ref.get()
  if (!snap.exists) throw new Error(`Post ${input.postId} not found`)
  const post = snap.data()!
  if (post.orgId !== input.orgId) throw new Error('Post does not belong to org')

  const oldText: string = (post.content?.text as string) ?? (post.content as string) ?? ''
  const platform: string = (post.platforms?.[0] as string) ?? 'twitter'

  const feedback = await loadUnresolvedFeedback(input.postId)
  if (feedback.length === 0) {
    throw new Error('No unresolved rejection feedback found to regenerate from')
  }

  const { system, prompt } = buildRegenerationPrompt({
    originalText: oldText,
    feedback,
    platform,
  })

  const { text: rawText } = await generateText({
    model: BRIEF_MODEL,
    system,
    prompt,
    maxOutputTokens: 1500,
  })

  const newText = rawText.trim().replace(/^"""?\n?/, '').replace(/\n?"""?$/, '').trim()

  const currentRegenCount = (post.approval?.regenerationCount as number) ?? 0
  const updates: Record<string, unknown> = {
    'content.text': newText,
    status: 'qa_review' as PostStatus,
    'approval.regenerationCount': currentRegenCount + 1,
    'approval.lastRejectedAt': post.approval?.lastRejectedAt ?? null,
    updatedAt: FieldValue.serverTimestamp(),
  }
  if (!post.originalContent) {
    updates.originalContent = oldText
  }

  await ref.update(updates)

  // Mark the rejection comments as picked up so they don't get reused.
  const batch = adminDb.batch()
  for (const f of feedback) {
    const commentRef = ref.collection('comments').doc(f.commentId)
    batch.update(commentRef, {
      agentPickedUp: true,
      agentPickedUpAt: FieldValue.serverTimestamp(),
    })
  }
  // Add a handoff comment summarising the regeneration.
  const summaryComment = ref.collection('comments').doc()
  batch.set(summaryComment, {
    userId: 'ai-agent',
    userName: 'Pip (AI Agent)',
    userRole: 'ai',
    kind: 'agent_handoff',
    text: `Regenerated post incorporating ${feedback.length} piece${feedback.length === 1 ? '' : 's'} of feedback. Re-submitted to QA review.`,
    agentPickedUp: true,
    createdAt: FieldValue.serverTimestamp(),
  })
  await batch.commit()

  await logAudit({
    orgId: input.orgId,
    action: 'post.regenerated',
    entityType: 'post',
    entityId: input.postId,
    performedBy: input.actorUid,
    performedByRole: input.actorRole,
    details: {
      feedbackCount: feedback.length,
      stages: feedback.map(f => f.stage),
      oldLength: oldText.length,
      newLength: newText.length,
      regenerationCount: currentRegenCount + 1,
    },
  })

  return {
    postId: input.postId,
    newStatus: 'qa_review',
    oldText,
    newText,
    feedbackUsed: feedback,
    regenerationCount: currentRegenCount + 1,
  }
}
