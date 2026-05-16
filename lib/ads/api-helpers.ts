// lib/ads/api-helpers.ts
import { NextRequest } from 'next/server'
import { apiError } from '@/lib/api/response'
import { getConnection, decryptAccessToken } from '@/lib/ads/connections/store'
import type { AdConnection, AdPlatform } from './types'

export interface MetaContext {
  orgId: string
  connection: AdConnection
  accessToken: string
  /** act_xxx — defaultAdAccountId from connection */
  adAccountId: string
}

/**
 * Resolves the per-org Meta connection + default ad account + decrypts the token.
 * Returns either a MetaContext OR an apiError Response to short-circuit the route.
 *
 * Usage:
 *   const ctx = await requireMetaContext(req)
 *   if (ctx instanceof Response) return ctx
 *   // ctx.connection, ctx.accessToken, ctx.adAccountId available
 */
export async function requireMetaContext(
  req: NextRequest,
  platform: AdPlatform = 'meta',
): Promise<MetaContext | Response> {
  const orgId = req.headers.get('X-Org-Id')
  if (!orgId) return apiError('Missing X-Org-Id header', 400)

  const conn = await getConnection({ orgId, platform })
  if (!conn) return apiError(`No ${platform} connection for this org`, 404)

  if (!conn.defaultAdAccountId) {
    return apiError(`No default ad account set on ${platform} connection`, 400)
  }

  const accessToken = decryptAccessToken(conn)
  const ctx: MetaContext = {
    orgId,
    connection: conn,
    accessToken,
    adAccountId: conn.defaultAdAccountId,
  }
  return ctx
}

/** Strip server-managed fields from doc before client serialization. */
export function stripInternalFields<T extends { providerData?: unknown }>(doc: T): T {
  // Phase 2: nothing sensitive on campaign/adset/ad docs yet
  return doc
}
