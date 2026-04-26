// GET /api/v1/properties/:id/connections — list all integration connections.

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { listConnectionsForProperty } from '@/lib/integrations/connections'
import { adminDb } from '@/lib/firebase/admin'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

export const GET = withAuth('admin', async (_req: NextRequest, _user, ctx) => {
  const { id } = await (ctx as RouteContext).params
  // Verify the property exists & is visible to this caller.
  const propDoc = await adminDb.collection('properties').doc(id).get()
  if (!propDoc.exists) {
    return NextResponse.json({ error: 'Property not found' }, { status: 404 })
  }
  const connections = await listConnectionsForProperty(id)
  // Strip ciphertext from response — not needed by UI, leaks nothing if logged.
  const sanitized = connections.map(({ credentialsEnc: _e, ...rest }) => ({
    ...rest,
    hasCredentials: Boolean(_e),
  }))
  return NextResponse.json({ ok: true, connections: sanitized })
})
