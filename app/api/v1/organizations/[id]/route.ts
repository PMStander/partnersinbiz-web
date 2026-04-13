/**
 * GET    /api/v1/organizations/[id] — get org details
 * PUT    /api/v1/organizations/[id] — update org
 * DELETE /api/v1/organizations/[id] — soft delete (active: false)
 */
import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { slugify, isMember, isOwnerOrAdmin, isOwner } from '@/lib/organizations/helpers'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

export const GET = withAuth('admin', async (req, user, ctx) => {
  const { id } = await (ctx as RouteContext).params
  const doc = await adminDb.collection('organizations').doc(id).get()
  if (!doc.exists) return apiError('Organisation not found', 404)

  const data = doc.data()!
  // withAuth('admin') already blocks non-admin users; this guard is for any future role expansion
  // Non-admin roles must be a member
  if (user.role !== 'admin' && user.role !== 'ai') {
    if (!isMember(data.members ?? [], user.uid)) return apiError('Forbidden', 403)
  }

  return apiSuccess({ id: doc.id, ...data })
})

export const PUT = withAuth('admin', async (req, user, ctx) => {
  const { id } = await (ctx as RouteContext).params
  const doc = await adminDb.collection('organizations').doc(id).get()
  if (!doc.exists) return apiError('Organisation not found', 404)

  const data = doc.data()!
  // withAuth('admin') already blocks non-admin users; this guard is for any future role expansion
  if (user.role !== 'admin' && user.role !== 'ai') {
    if (!isOwnerOrAdmin(data.members ?? [], user.uid)) return apiError('Forbidden', 403)
  }

  const body = await req.json().catch(() => ({}))
  const updates: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() }

  if (typeof body.name === 'string' && body.name.trim()) {
    const newName = body.name.trim()
    const newSlug = slugify(newName)
    // Check slug uniqueness (allow same org)
    if (newSlug !== data.slug) {
      const existing = await adminDb.collection('organizations').where('slug', '==', newSlug).get()
      if (!existing.empty) return apiError(`Slug "${newSlug}" already taken`, 409)
    }
    updates.name = newName
    updates.slug = newSlug
  }
  if (typeof body.description === 'string') updates.description = body.description.trim()
  if (typeof body.logoUrl === 'string') updates.logoUrl = body.logoUrl.trim()
  if (typeof body.website === 'string') updates.website = body.website.trim()

  await adminDb.collection('organizations').doc(id).update(updates)
  return apiSuccess({ id, updated: true })
})

export const DELETE = withAuth('admin', async (req, user, ctx) => {
  const { id } = await (ctx as RouteContext).params
  const doc = await adminDb.collection('organizations').doc(id).get()
  if (!doc.exists) return apiError('Organisation not found', 404)

  const data = doc.data()!
  // withAuth('admin') already blocks non-admin users; this guard is for any future role expansion
  if (user.role !== 'admin' && user.role !== 'ai') {
    if (!isOwner(data.members ?? [], user.uid)) return apiError('Forbidden — only owners can delete', 403)
  }

  await adminDb.collection('organizations').doc(id).update({
    active: false,
    updatedAt: FieldValue.serverTimestamp(),
  })

  return apiSuccess({ id, deleted: true })
})
