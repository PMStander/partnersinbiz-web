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

export const GET = withAuth('client', async (req, user) => {
  // Single-field filter only — avoids requiring a composite Firestore index.
  // Sorting is done in memory after fetch.
  const snapshot = await adminDb
    .collection('organizations')
    .where('active', '==', true)
    .get()

  const orgs = snapshot.docs
    .map((doc) => {
      const data = doc.data() as Organization
      return { id: doc.id, ...data }
    })
    .sort((a, b) => {
      const aTs = (a.createdAt as any)?._seconds ?? 0
      const bTs = (b.createdAt as any)?._seconds ?? 0
      return bTs - aTs
    })
    .filter((org) => {
      // AI agents always see all orgs.
      if (user.role === 'ai') return true
      // Admins: super admins (no allowedOrgIds) see all; restricted admins
      // see only their allowed orgs (plus their home org if set).
      if (user.role === 'admin') {
        const allowed = user.allowedOrgIds
        if (!Array.isArray(allowed) || allowed.length === 0) return true
        if (org.id === user.orgId) return true
        return allowed.includes(org.id!)
      }
      // Clients: only orgs they are a member of.
      return isMember(org.members ?? [], user.uid)
    })
    .map((org): OrganizationSummary => ({
      id: org.id!,
      name: org.name,
      slug: org.slug,
      type: org.type ?? 'client',
      status: org.status ?? (org.active !== false ? 'active' : 'churned'),
      description: org.description,
      logoUrl: org.logoUrl,
      website: org.website,
      memberCount: (org.members ?? []).length,
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
    type: typeof body.type === 'string' ? body.type : 'client',
    status: typeof body.status === 'string' ? body.status : 'active',
    description: typeof body.description === 'string' ? body.description.trim() : '',
    logoUrl: typeof body.logoUrl === 'string' ? body.logoUrl.trim() : '',
    website: typeof body.website === 'string' ? body.website.trim() : '',
    industry: typeof body.industry === 'string' ? body.industry.trim() : '',
    billingEmail: typeof body.billingEmail === 'string' ? body.billingEmail.trim() : '',
    plan: typeof body.plan === 'string' ? body.plan : '',
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
