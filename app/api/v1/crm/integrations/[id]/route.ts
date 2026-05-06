/**
 * GET    /api/v1/crm/integrations/[id]
 * PUT    /api/v1/crm/integrations/[id]    — partial update (name, config, autoTags, autoCampaignIds, cadenceMinutes, status)
 * DELETE /api/v1/crm/integrations/[id]    — soft-delete
 *
 * Auth: client
 */
import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { resolveOrgScope } from '@/lib/api/orgScope'
import { apiSuccess, apiError } from '@/lib/api/response'
import { findProvider, toPublicView, type CrmIntegration } from '@/lib/crm/integrations/types'
import type { ApiUser } from '@/lib/api/types'
import { encryptCredentials, decryptCredentials } from '@/lib/integrations/crypto'

type Params = { params: Promise<{ id: string }> }

export const GET = withAuth('client', async (_req: NextRequest, user: ApiUser, context?: unknown) => {
  const { id } = await (context as Params).params
  const snap = await adminDb.collection('crm_integrations').doc(id).get()
  if (!snap.exists || snap.data()?.deleted) return apiError('Integration not found', 404)
  const rawData = snap.data() as CrmIntegration
  const scope = resolveOrgScope(user, (rawData?.orgId as string | undefined) ?? null)
  if (!scope.ok) return apiError(scope.error, scope.status)

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id: _rawId, ...rawRest } = rawData as CrmIntegration & Record<string, unknown>
  const integration = { id: snap.id, ...rawRest } as CrmIntegration
  // Decrypt configEnc for in-memory use; toPublicView returns only configPreview (redacted)
  if (rawRest.configEnc) {
    try {
      integration.config = decryptCredentials<Record<string, string>>(rawRest.configEnc, rawRest.orgId)
    } catch (err) {
      console.error('[crm-integration] config decrypt failed', id, err)
      integration.config = {}
    }
  }
  return apiSuccess(toPublicView(integration))
})

export const PUT = withAuth('client', async (req: NextRequest, user: ApiUser, context?: unknown) => {
  const { id } = await (context as Params).params
  const body = await req.json().catch(() => null)
  if (!body) return apiError('Invalid JSON', 400)

  const snap = await adminDb.collection('crm_integrations').doc(id).get()
  if (!snap.exists || snap.data()?.deleted) return apiError('Integration not found', 404)
  const rawCurrent = snap.data() as CrmIntegration
  const scope = resolveOrgScope(user, rawCurrent.orgId ?? null)
  if (!scope.ok) return apiError(scope.error, scope.status)

  // Decrypt existing config for merging
  let currentConfig: Record<string, string> = rawCurrent.config ?? {}
  if (rawCurrent.configEnc) {
    try {
      currentConfig = decryptCredentials<Record<string, string>>(rawCurrent.configEnc, rawCurrent.orgId)
    } catch (err) {
      console.error('[crm-integration] config decrypt failed on PUT', id, err)
    }
  }

  const editable: Record<string, unknown> = {}
  if (typeof body.name === 'string') editable.name = body.name.trim()
  if (Array.isArray(body.autoTags)) editable.autoTags = body.autoTags
  if (Array.isArray(body.autoCampaignIds)) editable.autoCampaignIds = body.autoCampaignIds
  if (typeof body.cadenceMinutes === 'number') editable.cadenceMinutes = body.cadenceMinutes

  // Status transitions: only allow paused/active toggle from the user
  if (typeof body.status === 'string' && (body.status === 'paused' || body.status === 'active')) {
    editable.status = body.status
  }

  // Config patch — merge into existing, validate against provider schema, re-encrypt
  let mergedConfig: Record<string, string> | null = null
  if (body.config && typeof body.config === 'object') {
    const entry = findProvider(rawCurrent.provider)
    if (!entry) return apiError('Provider not registered', 500)
    const newConfig = { ...currentConfig }
    for (const field of entry.configFields) {
      const v = body.config[field.key]
      if (typeof v === 'string' && v.trim()) newConfig[field.key] = v.trim()
    }
    mergedConfig = newConfig
    editable.configEnc = encryptCredentials(newConfig, rawCurrent.orgId)
  }

  if (Object.keys(editable).length === 0) {
    return apiError('No editable fields supplied', 400)
  }

  editable.updatedAt = FieldValue.serverTimestamp()
  await snap.ref.update(editable)

  const updated = await snap.ref.get()
  const updatedIntegration = { id: snap.id, ...updated.data(), config: mergedConfig ?? currentConfig } as CrmIntegration
  return apiSuccess(toPublicView(updatedIntegration))
})

export const DELETE = withAuth('client', async (_req: NextRequest, user: ApiUser, context?: unknown) => {
  const { id } = await (context as Params).params
  const snap = await adminDb.collection('crm_integrations').doc(id).get()
  if (!snap.exists || snap.data()?.deleted) return apiError('Integration not found', 404)
  const scope = resolveOrgScope(user, (snap.data()?.orgId as string | undefined) ?? null)
  if (!scope.ok) return apiError(scope.error, scope.status)
  await snap.ref.update({ deleted: true, updatedAt: FieldValue.serverTimestamp() })
  return apiSuccess({ id })
})
