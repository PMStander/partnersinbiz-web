import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { lastActorFrom } from '@/lib/api/actor'
import { logActivity } from '@/lib/activity/log'
import { sendEmail } from '@/lib/email/send'
import type { ApiUser } from '@/lib/api/types'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

export const POST = withAuth(
  'client',
  async (_req: NextRequest, user: ApiUser, context?: unknown) => {
    const { id } = await (context as RouteContext).params

    const ref = adminDb.collection('seo_content').doc(id)
    const snap = await ref.get()
    if (!snap.exists) return apiError('Content not found', 404)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = snap.data() as any
    if (data.deleted) return apiError('Content not found', 404)
    if (user.role !== 'ai' && user.role !== 'admin' && data.orgId !== user.orgId) {
      return apiError('Access denied', 403)
    }

    if (data.status !== 'review') {
      return apiError('Content is not awaiting review', 400)
    }

    // Resolve display name
    const userDoc = await adminDb.collection('users').doc(user.uid).get()
    const displayName: string = userDoc.exists
      ? (userDoc.data()?.displayName || user.uid)
      : user.uid

    await ref.update({
      status: 'client_approved',
      clientApprovedAt: FieldValue.serverTimestamp(),
      clientApprovedBy: user.uid,
      ...lastActorFrom(user),
    })

    // Activity log
    logActivity({
      orgId: data.orgId,
      type: 'seo_content_client_approved',
      actorId: user.uid,
      actorName: displayName,
      actorRole: 'client',
      description: `Approved "${data.title ?? id}" for publishing`,
      entityId: id,
      entityType: 'seo_content',
      entityTitle: data.title ?? id,
    }).catch(() => {})

    // Notification (fire and forget)
    adminDb
      .collection('notifications')
      .add({
        orgId: data.orgId,
        userId: null,
        agentId: null,
        type: 'seo_content_client_approved',
        title: `Client approved: ${data.title ?? 'Blog post'}`,
        body: `${displayName} approved this post for publishing.`,
        link: `/admin/org/${data.orgId}/social`,
        data: { contentId: id },
        priority: 'high',
        status: 'unread',
        snoozedUntil: null,
        readAt: null,
        createdAt: FieldValue.serverTimestamp(),
      })
      .catch(() => {})

    // Email to Peet (fire and forget)
    sendEmail({
      to: 'peet.stander@partnersinbiz.online',
      subject: `✅ "${data.title}" approved by client`,
      html: `<p>${displayName} has approved <strong>${data.title}</strong> for publishing. Log in to publish it.</p><p><a href="https://partnersinbiz.online/admin">Open admin</a></p>`,
    }).catch(() => {})

    return apiSuccess({ id, status: 'client_approved' })
  },
)
