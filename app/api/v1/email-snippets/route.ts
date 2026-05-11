// app/api/v1/email-snippets/route.ts
//
// GET ?orgId=…&category=…
// POST { orgId?, name, description?, category, blocks }
//
// Org-scoped reusable block groups. Starter snippets (id prefix
// "starter-snippet-") are merged in from lib/email-builder/snippet-presets.ts.

import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { resolveOrgScope } from '@/lib/api/orgScope'
import { apiSuccess, apiError } from '@/lib/api/response'
import { FieldValue } from 'firebase-admin/firestore'
import { actorFrom } from '@/lib/api/actor'
import { STARTER_SNIPPETS } from '@/lib/email-builder/snippet-presets'
import { validateSnippetInput, snippetCategories } from '@/lib/email-builder/snippet-validate'
import type { EmailSnippet, SnippetCategory } from '@/lib/email-builder/types'
import type { ApiUser } from '@/lib/api/types'

export const dynamic = 'force-dynamic'

function isCategory(v: unknown): v is SnippetCategory {
  return typeof v === 'string' && (snippetCategories() as string[]).includes(v)
}

export const GET = withAuth('client', async (req: NextRequest, user: ApiUser) => {
  const { searchParams } = new URL(req.url)
  const scope = resolveOrgScope(user, searchParams.get('orgId'))
  if (!scope.ok) return apiError(scope.error, scope.status)
  const orgId = scope.orgId
  const categoryParam = searchParams.get('category')
  const category: SnippetCategory | null = isCategory(categoryParam) ? categoryParam : null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q: any = adminDb.collection('email_snippets').where('orgId', '==', orgId)
  const snap = await q.get()
  const orgSnippets = snap.docs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((d: any) => ({ id: d.id, ...d.data() }))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((s: any) => s.deleted !== true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((s: any) => ({
      ...s,
      isStarter: false,
      createdAt: s.createdAt?.toDate?.()?.toISOString?.() ?? null,
      updatedAt: s.updatedAt?.toDate?.()?.toISOString?.() ?? null,
    })) as EmailSnippet[]

  const merged: EmailSnippet[] = [...orgSnippets, ...STARTER_SNIPPETS]
  const filtered = category ? merged.filter((s) => s.category === category) : merged

  filtered.sort((a, b) => {
    if (a.isStarter !== b.isStarter) return a.isStarter ? 1 : -1
    const at = a.updatedAt ? Date.parse(a.updatedAt) : 0
    const bt = b.updatedAt ? Date.parse(b.updatedAt) : 0
    return bt - at
  })

  return apiSuccess(filtered, 200, { total: filtered.length, page: 1, limit: filtered.length })
})

export const POST = withAuth('client', async (req: NextRequest, user: ApiUser) => {
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return apiError('Body required', 400)
  const requestedOrgId = typeof body.orgId === 'string' ? body.orgId.trim() : null
  const scope = resolveOrgScope(user, requestedOrgId)
  if (!scope.ok) return apiError(scope.error, scope.status)
  const orgId = scope.orgId

  const v = validateSnippetInput(body)
  if (!v.ok) return apiError('Invalid snippet: ' + v.errors.join('; '), 400)

  const docData = {
    orgId,
    name: v.value.name,
    description: v.value.description,
    category: v.value.category,
    blocks: v.value.blocks,
    isStarter: false,
    deleted: false,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    ...actorFrom(user),
  }

  const ref = await adminDb.collection('email_snippets').add(docData)
  return apiSuccess({ id: ref.id, ...docData, createdAt: null, updatedAt: null }, 201)
})
