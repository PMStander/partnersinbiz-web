/**
 * GET  /api/v1/clients  — list all clients (admin only)
 * POST /api/v1/clients  — create a new client (admin only)
 */
import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'

function isValidEmail(e: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)
}

export const GET = withAuth('admin', async () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const snapshot = await adminDb
    .collection('clients')
    .orderBy('createdAt', 'desc')
    .get()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clients = snapshot.docs.map((doc: any) => ({
    id: doc.id,
    ...doc.data(),
  }))

  return apiSuccess(clients)
})

export const POST = withAuth('admin', async (req: NextRequest) => {
  const body = await req.json()

  if (!body.name?.trim()) return apiError('Name is required')
  if (!body.email?.trim()) return apiError('Email is required')
  if (!isValidEmail(body.email)) return apiError('Email is invalid')

  const docRef = await adminDb.collection('clients').add({
    name: body.name.trim(),
    company: body.company?.trim() ?? '',
    email: body.email.trim().toLowerCase(),
    note: body.note?.trim() ?? '',
    status: 'active',
    uid: '',
    contactId: '',
    createdAt: FieldValue.serverTimestamp(),
  })

  return apiSuccess({ id: docRef.id }, 201)
})
