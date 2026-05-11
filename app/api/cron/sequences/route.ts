// app/api/cron/sequences/route.ts
import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { apiSuccess, apiError } from '@/lib/api/response'
import { sendCampaignEmail } from '@/lib/email/resend'
import { resolveFrom } from '@/lib/email/resolveFrom'
import { interpolate, varsFromContact } from '@/lib/email/template'
import { signUnsubscribeToken } from '@/lib/email/unsubscribeToken'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { pickVariantForSend, incrementVariantStat } from '@/lib/ab-testing/cronHelpers'
import { applyVariantOverrides } from '@/lib/ab-testing/apply'
import type { AbConfig } from '@/lib/ab-testing/types'

export const dynamic = 'force-dynamic'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://partnersinbiz.online'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) return apiError('Unauthorized', 401)

  const now = Timestamp.now()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const snap = await (adminDb.collection('sequence_enrollments') as any)
    .where('status', '==', 'active')
    .where('nextSendAt', '<=', now)
    .get()

  let processed = 0

  for (const enrollDoc of snap.docs) {
    try {
      const enrollment = enrollDoc.data()

      const seqSnap = await adminDb.collection('sequences').doc(enrollment.sequenceId).get()
      if (!seqSnap.exists) continue
      const seq = seqSnap.data()!
      const steps = seq.steps ?? []
      const step = steps[enrollment.currentStep]
      if (!step) continue

      const contactSnap = await adminDb.collection('contacts').doc(enrollment.contactId).get()
      if (!contactSnap.exists) continue
      const contact = contactSnap.data()!

      // Hard-block: skip and exit if contact has bounced or unsubscribed.
      if (contact.bouncedAt || contact.unsubscribedAt) {
        await adminDb.collection('sequence_enrollments').doc(enrollDoc.id).update({
          status: 'exited',
          exitReason: contact.bouncedAt ? 'bounced' : 'unsubscribed',
          updatedAt: FieldValue.serverTimestamp(),
        })
        continue
      }

      // Look up the org for fallback display name
      const orgId: string = enrollment.orgId ?? ''
      let orgName = ''
      if (orgId) {
        const orgSnap = await adminDb.collection('organizations').doc(orgId).get()
        if (orgSnap.exists) {
          orgName = (orgSnap.data() as { name?: string })?.name ?? ''
        }
      }

      // Look up the campaign if linked. Honor pause / completed / deleted states.
      type CampaignLite = {
        fromDomainId?: string
        fromName?: string
        fromLocal?: string
        replyTo?: string
        status?: string
        deleted?: boolean
      }
      const campaignId: string = enrollment.campaignId ?? ''
      let campaign: CampaignLite | null = null

      if (campaignId) {
        const campSnap = await adminDb.collection('campaigns').doc(campaignId).get()
        if (campSnap.exists) {
          campaign = (campSnap.data() ?? null) as CampaignLite | null
          if (campaign?.deleted || campaign?.status === 'completed') {
            await adminDb.collection('sequence_enrollments').doc(enrollDoc.id).update({
              status: 'exited',
              exitReason: 'manual',
              updatedAt: FieldValue.serverTimestamp(),
            })
            continue
          }
          if (campaign?.status === 'paused') {
            // Skip — leave the enrollment unchanged so it retries once unpaused.
            continue
          }
        }
      }

      // Resolve sender
      const resolved = await resolveFrom({
        fromDomainId: campaign?.fromDomainId,
        fromName: campaign?.fromName,
        fromLocal: campaign?.fromLocal || 'campaigns',
        orgName,
      })

      // Build template variables
      const unsubscribeUrl = `${BASE_URL}/api/unsubscribe?token=${signUnsubscribeToken(enrollment.contactId, campaignId || undefined)}`
      const vars = {
        ...varsFromContact(contact),
        orgName,
        unsubscribeUrl,
      }

      const interpolatedSubject = interpolate(step.subject ?? '', vars)
      const interpolatedHtml = interpolate(step.bodyHtml ?? '', vars)
      const interpolatedText = interpolate(step.bodyText ?? '', vars)

      // A/B variant pick — applies only when step.ab.enabled === true.
      const stepAb = (step.ab as AbConfig | undefined) ?? null
      const variantPick = pickVariantForSend({
        contactId: enrollment.contactId,
        subjectId: `${enrollment.sequenceId}:${enrollment.currentStep}`,
        ab: stepAb,
      })
      if (variantPick.defer) {
        // Winner-only cohort excludes this contact for now; nextSendAt stays so
        // the cron picks them up again after the winner is decided.
        continue
      }
      const effective = applyVariantOverrides(
        {
          subject: interpolatedSubject,
          bodyHtml: interpolatedHtml,
          bodyText: interpolatedText,
          fromName: campaign?.fromName ?? '',
          scheduledFor: null,
        },
        variantPick.variant,
      )

      // Send via Resend
      const sendResult = await sendCampaignEmail({
        from: resolved.from,
        to: contact.email,
        replyTo: campaign?.replyTo,
        subject: effective.subject,
        html: effective.bodyHtml,
        text: effective.bodyText,
      })

      // Create email doc
      const emailRef = await adminDb.collection('emails').add({
        orgId,
        campaignId,
        fromDomainId: resolved.fromDomainId,
        direction: 'outbound',
        contactId: enrollment.contactId,
        resendId: sendResult.resendId,
        from: resolved.from,
        to: contact.email,
        cc: [],
        subject: effective.subject,
        bodyHtml: effective.bodyHtml,
        bodyText: effective.bodyText,
        status: sendResult.ok ? 'sent' : 'failed',
        scheduledFor: null,
        sentAt: sendResult.ok ? FieldValue.serverTimestamp() : null,
        openedAt: null,
        clickedAt: null,
        bouncedAt: null,
        sequenceId: enrollment.sequenceId,
        sequenceStep: enrollment.currentStep,
        variantId: variantPick.variant?.id ?? '',
        createdAt: FieldValue.serverTimestamp(),
      })

      // Variant-level sent-stat increment (best-effort).
      if (sendResult.ok && variantPick.variant?.id) {
        try {
          await incrementVariantStat({
            targetCollection: 'sequences',
            targetId: enrollment.sequenceId,
            stepNumber: enrollment.currentStep,
            variantId: variantPick.variant.id,
            field: 'sent',
          })
        } catch (err) {
          console.error('[cron/sequences] variant stat increment failed', err)
        }
      }

      // Log activity
      await adminDb.collection('activities').add({
        orgId,
        contactId: enrollment.contactId,
        type: 'email_sent',
        summary: `Sequence step ${enrollment.currentStep + 1}: ${interpolatedSubject}`,
        metadata: { emailId: emailRef.id, campaignId, sequenceId: enrollment.sequenceId },
        createdAt: FieldValue.serverTimestamp(),
      })

      // Bump campaign stats on success
      if (sendResult.ok && campaignId) {
        await adminDb.collection('campaigns').doc(campaignId).update({
          'stats.sent': FieldValue.increment(1),
          updatedAt: FieldValue.serverTimestamp(),
        })
      }

      const nextStep = enrollment.currentStep + 1
      const isLast = nextStep >= steps.length

      if (isLast) {
        await adminDb.collection('sequence_enrollments').doc(enrollDoc.id).update({
          status: 'completed',
          exitReason: 'completed',
          completedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        })
      } else {
        const nextDelayMs = steps[nextStep].delayDays * 24 * 60 * 60 * 1000
        const nextSendAt = Timestamp.fromDate(new Date(Date.now() + nextDelayMs))
        await adminDb.collection('sequence_enrollments').doc(enrollDoc.id).update({
          currentStep: nextStep,
          nextSendAt,
          updatedAt: FieldValue.serverTimestamp(),
        })
      }

      processed++
    } catch (err) {
      // Log and continue so a single bad enrollment doesn't abort the whole run.
      console.error('[cron/sequences] enrollment failed', enrollDoc.id, err)
    }
  }

  return apiSuccess({ processed })
}
