/**
 * GET  /api/v1/organizations — list orgs the current user has access to
 * POST /api/v1/organizations — create a new organization
 */
import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { slugify, isMember } from '@/lib/organizations/helpers'
import type { Organization, OrgMember, OrganizationSummary } from '@/lib/organizations/types'

export const dynamic = 'force-dynamic'

export const GET = withAuth('admin', async (req, user) => {
  const snapshot = await adminDb
    .collection('organizations')
    .where('active', '==', true)
    .orderBy('createdAt', 'desc')
    .get()

  const orgs = snapshot.docs
    .map((doc) => {
      const data = doc.data() as Organization
      return { id: doc.id, ...data }
    })
    .filter((org) => {
      // AI agents and admins see all orgs; clients only see their own
      if (user.role === 'ai' || user.role === 'admin') return true
      return isMember(org.members ?? [], user.uid)
    })
    .map((org): OrganizationSummary => ({
      id: org.id!,
      name: org.name,
      slug: org.slug,
      description: org.description,
      logoUrl: org.logoUrl,
      website: org.website,
      active: org.active,
      memberCount: (org.members ?? []).length,
      linkedClientId: org.linkedClientId ?? '',
      createdAt: org.createdAt,
      updatedAt: org.updatedAt,
    }))

  return apiSuccess(orgs)
})

export const POST = withAuth('admin', async (req, user) => {
  const body = await req.json().catch(() => ({}))

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) return apiError('name is required', 400)

  const slug = slugify(name)

  // Check slug uniqueness
  const existing = await adminDb
    .collection('organizations')
    .where('slug', '==', slug)
    .get()
  if (!existing.empty) return apiError(`An organisation with slug "${slug}" already exists`, 409)

  const ownerMember: OrgMember = { userId: user.uid, role: 'owner' }

  const doc = {
    name,
    slug,
    description: typeof body.description === 'string' ? body.description.trim() : '',
    logoUrl: typeof body.logoUrl === 'string' ? body.logoUrl.trim() : '',
    website: typeof body.website === 'string' ? body.website.trim() : '',
    createdBy: user.uid,
    members: [ownerMember],
    linkedClientId: '',
    active: true,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }

  const docRef = await adminDb.collection('organizations').add(doc)

  return apiSuccess({ id: docRef.id, slug }, 201)
})
