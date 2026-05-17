// app/api/v1/ads/google/connections/[id]/customer/route.ts
//
// Sets the `loginCustomerId` on a Google Ads connection. Called by the admin
// connections UI after the user picks a Customer ID from the
// `customers:listAccessibleCustomers` response.
//
// Google-namespaced rather than reusing the generic `[platform]` route so
// Meta's connection mutation paths stay untouched and the Google flow can
// evolve (e.g. validation against MCC hierarchy) independently.
import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { adminDb } from '@/lib/firebase/admin'
import { updateConnection } from '@/lib/ads/connections/store'
import type { AdConnection } from '@/lib/ads/types'

const COLLECTION = 'ad_connections'

export const dynamic = 'force-dynamic'

export const PATCH = withAuth(
  'admin',
  async (
    req: NextRequest,
    _user: unknown,
    ctx: { params: Promise<{ id: string }> },
  ) => {
    const orgId = req.headers.get('X-Org-Id')
    if (!orgId) return apiError('Missing X-Org-Id header', 400)

    const { id } = await ctx.params
    if (!id) return apiError('Missing connection id', 400)

    let body: { loginCustomerId?: unknown }
    try {
      body = (await req.json()) as { loginCustomerId?: unknown }
    } catch {
      return apiError('Invalid JSON body', 400)
    }

    const raw = body.loginCustomerId
    if (typeof raw !== 'string' || raw.trim().length === 0) {
      return apiError('loginCustomerId must be a non-empty string', 400)
    }
    // Google customer IDs are 10 digits, sometimes copy/pasted as
    // 'XXX-XXX-XXXX'. Strip dashes/whitespace to normalise.
    const loginCustomerId = raw.replace(/[-\s]/g, '')
    if (!/^\d{8,12}$/.test(loginCustomerId)) {
      return apiError('loginCustomerId must be a 10-digit numeric customer id', 400)
    }

    const snap = await adminDb.collection(COLLECTION).doc(id).get()
    if (!snap.exists) return apiError('Connection not found', 404)
    const conn = snap.data() as AdConnection

    // Cross-tenant + platform guard. Same 404 as `GET .../customers` so we
    // don't leak that a connectionId exists in another org.
    if (conn.orgId !== orgId || conn.platform !== 'google') {
      return apiError('Connection not found', 404)
    }

    // Merge with any existing meta.google fields so we never clobber other
    // forward-compatible flags (e.g. developerToken pointer, refreshTokenExpiresAt).
    const existingMeta = (conn.meta ?? {}) as Record<string, unknown>
    const existingGoogle =
      (existingMeta.google as Record<string, unknown> | undefined) ?? {}

    const nextMeta = {
      ...existingMeta,
      google: {
        ...existingGoogle,
        loginCustomerId,
      },
    }

    await updateConnection(conn.id, { meta: nextMeta })

    return apiSuccess({ id: conn.id, loginCustomerId })
  },
)
