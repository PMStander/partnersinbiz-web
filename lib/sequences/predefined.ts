// lib/sequences/predefined.ts
//
// Predefined sequence templates. These showcase optional features like
// branching, exit goals, and wait-until conditions so a user can pick one
// up as a starting point.

import type { Sequence, SequenceStep, SequenceGoal } from './types'

export interface PredefinedSequence {
  id: string
  name: string
  description: string
  steps: SequenceStep[]
  goals?: SequenceGoal[]
  topicId?: string
}

// ── Templates ───────────────────────────────────────────────────────────────

const SALES_NURTURE_REPLY_EXIT: PredefinedSequence = {
  id: 'sales-nurture-reply-exit',
  name: 'Sales nurture (with reply-exit)',
  description:
    'A four-step sales nurture. Exits automatically when the contact replies, gets tagged "demo-booked", or reaches stage "won". Branches step 2 — engaged readers get a case study, the rest get a re-engagement nudge.',
  topicId: 'sales',
  goals: [
    {
      id: 'goal-replied',
      label: 'Contact replied',
      condition: { kind: 'replied' },
      exitReason: 'replied',
    },
    {
      id: 'goal-demo-booked',
      label: 'Demo booked',
      condition: { kind: 'contact-has-tag', tag: 'demo-booked' },
      exitReason: 'converted',
    },
    {
      id: 'goal-won',
      label: 'Deal won',
      condition: { kind: 'contact-at-stage', stage: 'won' },
      exitReason: 'converted',
    },
  ],
  steps: [
    {
      stepNumber: 1,
      delayDays: 0,
      subject: 'Quick intro — {{firstName}}',
      bodyText:
        "Hi {{firstName}},\n\nI'm reaching out because I think {{orgName}} can help with what you're working on.\n\nMind if I share a 2-minute overview?\n\n— The team",
      bodyHtml:
        "<p>Hi {{firstName}},</p><p>I'm reaching out because I think {{orgName}} can help with what you're working on.</p><p>Mind if I share a 2-minute overview?</p><p>— The team</p>",
      // Wait until business hours in the contact's timezone before sending.
      waitUntil: {
        condition: {
          kind: 'business-hours',
          startHourLocal: 9,
          endHourLocal: 17,
        },
        maxWaitDays: 1,
        onTimeout: 'send',
      },
    },
    {
      stepNumber: 2,
      delayDays: 3,
      subject: 'Following up — {{firstName}}',
      bodyText:
        "Hi {{firstName}},\n\nJust wanted to make sure my last email didn't get buried. Here's the short version: we help teams like yours grow faster, with less manual work.\n\nWorth a 15-min chat?",
      bodyHtml:
        "<p>Hi {{firstName}},</p><p>Just wanted to make sure my last email didn't get buried. Here's the short version: we help teams like yours grow faster, with less manual work.</p><p>Worth a 15-min chat?</p>",
      // Branch — readers who opened step 2 get the case study path; the
      // rest get a re-engagement nudge.
      branch: {
        rules: [
          {
            condition: { kind: 'opened' },
            nextStepNumber: 2, // index 2 = step 3 (case study)
            evaluateAfterDays: 2,
          },
        ],
        defaultNextStepNumber: 3, // index 3 = step 4 (re-engagement)
      },
    },
    {
      stepNumber: 3,
      delayDays: 2,
      subject: 'How {{orgName}}-style teams 3x growth',
      bodyText:
        "Hi {{firstName}},\n\nSince you opened my last one — here's a quick case study from a team in your space. They tripled their pipeline in 90 days using the same approach.\n\nWant the playbook?",
      bodyHtml:
        "<p>Hi {{firstName}},</p><p>Since you opened my last one — here's a quick case study from a team in your space. They tripled their pipeline in 90 days using the same approach.</p><p>Want the playbook?</p>",
    },
    {
      stepNumber: 4,
      delayDays: 5,
      subject: 'Last one from me — {{firstName}}',
      bodyText:
        "Hi {{firstName}},\n\nI'll stop reaching out after this one. If now isn't the right time, no worries — feel free to reply with a date that works and I'll circle back then.\n\n— The team",
      bodyHtml:
        "<p>Hi {{firstName}},</p><p>I'll stop reaching out after this one. If now isn't the right time, no worries — feel free to reply with a date that works and I'll circle back then.</p><p>— The team</p>",
    },
  ],
}

const SIMPLE_WELCOME: PredefinedSequence = {
  id: 'simple-welcome',
  name: 'Simple welcome (3 emails)',
  description:
    'A linear three-email welcome series. No branching, no goals — easiest starting point.',
  topicId: 'newsletter',
  steps: [
    {
      stepNumber: 1,
      delayDays: 0,
      subject: 'Welcome to {{orgName}} 👋',
      bodyText:
        "Hi {{firstName}},\n\nWelcome aboard! Over the next few days I'll share what we do best and how to get the most out of it.\n\n— The team",
      bodyHtml:
        "<p>Hi {{firstName}},</p><p>Welcome aboard! Over the next few days I'll share what we do best and how to get the most out of it.</p><p>— The team</p>",
    },
    {
      stepNumber: 2,
      delayDays: 2,
      subject: 'A quick win',
      bodyText: 'Here is one thing you can do in 5 minutes that makes a real difference…',
      bodyHtml: '<p>Here is one thing you can do in 5 minutes that makes a real difference…</p>',
    },
    {
      stepNumber: 3,
      delayDays: 4,
      subject: "Let's talk",
      bodyText: 'Got 15 minutes for a chat? Reply to this email and I will send a calendar link.',
      bodyHtml: '<p>Got 15 minutes for a chat? Reply to this email and I will send a calendar link.</p>',
    },
  ],
}

export const PREDEFINED_SEQUENCES: PredefinedSequence[] = [
  SIMPLE_WELCOME,
  SALES_NURTURE_REPLY_EXIT,
]

/**
 * Hydrate a predefined template into a Sequence-compatible shape that can
 * be inserted directly into Firestore. `orgId` and timestamps are left for
 * the caller to fill in.
 */
export function instantiatePredefinedSequence(
  templateId: string,
): Omit<Sequence, 'id' | 'orgId' | 'createdAt' | 'updatedAt'> | null {
  const tmpl = PREDEFINED_SEQUENCES.find((t) => t.id === templateId)
  if (!tmpl) return null
  return {
    name: tmpl.name,
    description: tmpl.description,
    status: 'draft',
    steps: tmpl.steps.map((s) => ({ ...s })),
    topicId: tmpl.topicId,
    goals: tmpl.goals?.map((g) => ({ ...g })),
  }
}
