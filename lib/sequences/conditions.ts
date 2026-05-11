// lib/sequences/conditions.ts
//
// Pure-ish evaluator for sequence branch / goal / wait-until conditions.
// Idempotent: calling evaluateCondition many times with the same context
// returns the same boolean (no side-effects, no writes).
//
// Used by:
//   • app/api/cron/sequences/route.ts — before sending we check exit goals
//     and wait-until gates; after sending we evaluate branch rules.
//   • app/api/v1/sequence-enrollments/[id]/path — to summarise journey.

import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import type { Contact, ContactStage } from '@/lib/crm/types'
import type {
  BranchCondition,
  WaitCondition,
  SequenceGoal,
} from './types'
import { hourInTimezone, dayOfWeekInTimezone } from '@/lib/email/send-time'

export interface EvaluationContext {
  orgId: string
  contact: Contact
  sequenceId: string
  /** The step we just sent (used for opened/clicked lookups). */
  stepNumber: number
  enrolledAt: Timestamp | null
  now: Date
  /** Optional cached goals so a `goal-hit` wait-condition can resolve. */
  goals?: SequenceGoal[]
  /** Internal cycle-guard for recursive evaluation of goal-hit waits. */
  __evaluatingGoals?: Set<string>
}

// ── Stage ordering ──────────────────────────────────────────────────────────
//
// Used by `contact-stage-reached` — "won" should satisfy a goal that watches
// for "proposal" (the contact has reached or passed that stage). `lost` is
// separate and does not chain.
const STAGE_ORDER: Record<ContactStage, number> = {
  new: 0,
  contacted: 1,
  replied: 2,
  demo: 3,
  proposal: 4,
  won: 5,
  lost: 99, // treated as separate, never "reaches" a positive stage
}

function stageReaches(current: string, target: string): boolean {
  if (current === target) return true
  if (target === 'lost') return current === 'lost'
  if (current === 'lost') return false
  const c = STAGE_ORDER[current as ContactStage]
  const t = STAGE_ORDER[target as ContactStage]
  if (typeof c !== 'number' || typeof t !== 'number') return false
  return c >= t
}

// ── Email-history lookups ───────────────────────────────────────────────────

interface EmailDoc {
  id: string
  sentAt?: Timestamp | null
  openedAt?: Timestamp | null
  clickedAt?: Timestamp | null
  bodyHtml?: string
  bodyText?: string
  sequenceStep?: number
}

/**
 * Find emails sent to this contact for this sequence. If `stepNumber` is
 * given, narrow to that step. Returns most-recent-first by sentAt fallback
 * to createdAt — Firestore won't order what doesn't exist, so we sort in
 * memory.
 */
async function findSequenceEmails(
  ctx: EvaluationContext,
  stepNumber?: number,
): Promise<EmailDoc[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = adminDb
    .collection('emails')
    .where('sequenceId', '==', ctx.sequenceId)
    .where('contactId', '==', ctx.contact.id)

  if (typeof stepNumber === 'number') {
    q = q.where('sequenceStep', '==', stepNumber)
  }

  try {
    const snap = await q.get()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return snap.docs.map((d: any) => ({ id: d.id, ...d.data() })) as EmailDoc[]
  } catch (err) {
    console.error('[sequences/conditions] findSequenceEmails failed', err)
    return []
  }
}

async function hasOpenedStep(ctx: EvaluationContext, step: number): Promise<boolean> {
  const emails = await findSequenceEmails(ctx, step)
  return emails.some((e) => !!e.openedAt)
}

async function hasClickedStep(ctx: EvaluationContext, step: number): Promise<boolean> {
  const emails = await findSequenceEmails(ctx, step)
  return emails.some((e) => !!e.clickedAt)
}

async function hasClickedLink(
  ctx: EvaluationContext,
  urlSubstring: string,
): Promise<boolean> {
  if (!urlSubstring) return false

  // 1. Try the dedicated `link_clicks` collection (key: contactId).
  try {
    const snap = await adminDb
      .collection('link_clicks')
      .where('contactId', '==', ctx.contact.id)
      .get()
    for (const doc of snap.docs) {
      const d = doc.data() as { targetUrl?: string; sequenceId?: string }
      if (d.sequenceId && d.sequenceId !== ctx.sequenceId) continue
      if (typeof d.targetUrl === 'string' && d.targetUrl.includes(urlSubstring)) {
        return true
      }
    }
  } catch {
    // Collection may not exist yet — fall through to body inspection.
  }

  // 2. Fallback — any sent email in the sequence whose body contains the URL
  //    AND was clicked (we can't pinpoint which link, but it's a reasonable
  //    proxy when link_clicks isn't available).
  const emails = await findSequenceEmails(ctx)
  return emails.some((e) => {
    if (!e.clickedAt) return false
    const html = e.bodyHtml ?? ''
    const text = e.bodyText ?? ''
    return html.includes(urlSubstring) || text.includes(urlSubstring)
  })
}

async function hasReplied(ctx: EvaluationContext): Promise<boolean> {
  // 1. Try inbound_emails collection (reply-tracking slice).
  try {
    const snap = await adminDb
      .collection('inbound_emails')
      .where('contactId', '==', ctx.contact.id)
      .where('sequenceId', '==', ctx.sequenceId)
      .where('intent', '==', 'reply')
      .limit(1)
      .get()
    if (!snap.empty) return true
  } catch {
    // Collection may not exist or query may need an index — fall through.
  }

  // 2. Fallback — contact.lastRepliedAt set after enrollment.
  const enrolledAtMs = ctx.enrolledAt?.toMillis?.() ?? 0
  const lastRepliedAt = (ctx.contact as Contact).lastRepliedAt
  if (lastRepliedAt && typeof lastRepliedAt.toMillis === 'function') {
    return lastRepliedAt.toMillis() >= enrolledAtMs
  }
  return false
}

async function daysSinceStep(
  ctx: EvaluationContext,
  step: number,
): Promise<number | null> {
  const emails = await findSequenceEmails(ctx, step)
  let earliestSent: number | null = null
  for (const e of emails) {
    const sentMs = e.sentAt?.toMillis?.()
    if (typeof sentMs === 'number') {
      if (earliestSent === null || sentMs < earliestSent) earliestSent = sentMs
    }
  }
  if (earliestSent === null) return null
  return (ctx.now.getTime() - earliestSent) / (24 * 60 * 60 * 1000)
}

// ── Main evaluator ──────────────────────────────────────────────────────────

export async function evaluateCondition(
  cond: BranchCondition | WaitCondition,
  ctx: EvaluationContext,
): Promise<boolean> {
  switch (cond.kind) {
    // ── Branch conditions ────────────────────────────────────────────────
    case 'opened':
      return hasOpenedStep(ctx, ctx.stepNumber)
    case 'not-opened':
      return !(await hasOpenedStep(ctx, ctx.stepNumber))
    case 'clicked':
      return hasClickedStep(ctx, ctx.stepNumber)
    case 'not-clicked':
      return !(await hasClickedStep(ctx, ctx.stepNumber))
    case 'clicked-link':
      return hasClickedLink(ctx, cond.urlSubstring)
    case 'contact-has-tag':
      return Array.isArray(ctx.contact.tags) && ctx.contact.tags.includes(cond.tag)
    case 'contact-at-stage':
      return ctx.contact.stage === cond.stage
    case 'replied':
      return hasReplied(ctx)
    case 'days-since-step': {
      const days = await daysSinceStep(ctx, ctx.stepNumber)
      if (days === null) return false
      return days >= cond.days
    }

    // ── Wait conditions ──────────────────────────────────────────────────
    case 'business-hours': {
      const tz = (cond.timezone && cond.timezone.trim()) || 'UTC'
      const hour = hourInTimezone(ctx.now, tz)
      // Allow wrap-around (e.g. 22..6 means 22:00 through 06:00).
      if (cond.startHourLocal <= cond.endHourLocal) {
        return hour >= cond.startHourLocal && hour < cond.endHourLocal
      }
      return hour >= cond.startHourLocal || hour < cond.endHourLocal
    }
    case 'day-of-week': {
      const tz = (cond.timezone && cond.timezone.trim()) || 'UTC'
      const dow = dayOfWeekInTimezone(ctx.now, tz)
      return Array.isArray(cond.daysOfWeek) && cond.daysOfWeek.includes(dow)
    }
    case 'contact-tag-added':
      return Array.isArray(ctx.contact.tags) && ctx.contact.tags.includes(cond.tag)
    case 'contact-stage-reached':
      return stageReaches(ctx.contact.stage, cond.stage)
    case 'goal-hit': {
      const goalId = cond.goalId
      const goals = ctx.goals ?? []
      const goal = goals.find((g) => g.id === goalId)
      if (!goal) return false
      // Cycle guard.
      const seen = ctx.__evaluatingGoals ?? new Set<string>()
      if (seen.has(goalId)) return false
      const nextSeen = new Set(seen)
      nextSeen.add(goalId)
      return evaluateCondition(goal.condition, { ...ctx, __evaluatingGoals: nextSeen })
    }
  }
}

/**
 * Evaluate every goal in order. Returns the first matching goal, or null
 * if none matched. Idempotent.
 */
export async function findHitGoal(
  goals: SequenceGoal[] | undefined,
  ctx: EvaluationContext,
): Promise<SequenceGoal | null> {
  if (!Array.isArray(goals) || goals.length === 0) return null
  for (const goal of goals) {
    try {
      const hit = await evaluateCondition(goal.condition, {
        ...ctx,
        goals,
      })
      if (hit) return goal
    } catch (err) {
      console.error('[sequences/conditions] goal eval failed', goal.id, err)
    }
  }
  return null
}
