// app/api/v1/portal/messages/route.ts
import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withPortalAuth } from '@/lib/auth/portal-middleware'
import { apiSuccess, apiError } from '@/lib/api/response'
import { FieldValue } from 'firebase-admin/firestore'

export const dynamic = 'force-dynamic'

export const GET = withPortalAuth(async (req: NextRequest, uid: string) => {
  const { searchParams } = new URL(req.url)
  const enquiryId = searchParams.get('enquiryId')
  if (!enquiryId) return apiError('enquiryId is required', 400)

  const enqSnap = await adminDb.collection('enquiries').doc(enquiryId).get()
  if (!enqSnap.exists) return apiError('Not found', 404)
  if (enqSnap.data()!.userId !== uid) return apiError('Forbidden', 403)

  const snap = await (adminDb.collection('portal_messages') as any)
    .where('enquiryId', '==', enquiryId)
    .orderBy('createdAt', 'asc')
    .get()
  const data = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }))
  return apiSuccess(data)
})

export const POST = withPortalAuth(async (req: NextRequest, uid: string) => {
  const body = await req.json().catch(() => null)
  if (!body?.enquiryId || !body?.text?.trim()) return apiError('enquiryId and text are required', 400)

  const enqSnap = await adminDb.collection('enquiries').doc(body.enquiryId).get()
  if (!enqSnap.exists) return apiError('Not found', 404)
  if (enqSnap.data()!.userId !== uid) return apiError('Forbidden', 403)

  const enqData = enqSnap.data()!

  const msgRef = await adminDb.collection('portal_messages').add({
    enquiryId: body.enquiryId,
    uid,
    authorName: enqData.name ?? 'Client',
    direction: 'inbound',
    text: body.text.trim(),
    createdAt: FieldValue.serverTimestamp(),
  })

  if (enqData.contactId) {
    await adminDb.collection('activities').add({
      contactId: enqData.contactId,
      type: 'note',
      note: `Client message: ${body.text.trim()}`,
      createdAt: FieldValue.serverTimestamp(),
    })
  }

  return apiSuccess({ id: msgRef.id }, 201)
})
