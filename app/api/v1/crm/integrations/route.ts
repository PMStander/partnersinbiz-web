/**
 * GET  /api/v1/crm/integrations?orgId=...   — list integrations for an org
 * POST /api/v1/crm/integrations             — create an integration
 *
 * Body (POST):
 *   provider       string (required)  — one of CrmIntegrationProvider
 *   name           string (required)
 *   config         Record<string, string>  — provider-specific (api keys, list ids)
 *   autoTags?      string[]
 *   autoCampaignIds? string[]
 *   cadenceMinutes? number
 *
 * Auth: client (open to portal users)
 *
 * Returns the public view (sensitive config redacted).
 */
import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { resolveOrgScope } from '@/lib/api/orgScope'
import { apiSuccess, apiError } from '@/lib/api/response'
import {
  EMPTY_SYNC_STATS,
  findProvider,
  toPublicView,
  type CrmIntegration,
  type CrmIntegrationProvider,
} from '@/lib/crm/integrations/types'
import { encryptCredentials, decryptCredentials } from '@/lib/integrations/crypto'

export const GET = withAuth('client', async (req: NextRequest, user) => {
  const { searchParams } = new URL(req.url)
  const scope = resolveOrgScope(user, searchParams.get('orgId'))
  if (!scope.ok) return apiError(scope.error, scope.status)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const snap = await (adminDb.collection('crm_integrations') as any)
    .where('orgId', '==', scope.orgId)
    .get()

  const integrations: CrmIntegration[] = snap.docs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((d: any) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id: _id, ...rest } = d.data() as CrmIntegration & { configEnc?: import('@/lib/integrations/crypto').EncryptedCredentials }
      const integration = { id: d.id as string, ...rest } as CrmIntegration
      // Decrypt configEnc back to config for in-memory use
      if (rest.configEnc) {
        try {
          integration.config = decryptCredentials<Record<string, string>>(rest.configEnc, rest.orgId)
        } catch (err) {
          console.error('[crm-integrations] config decrypt failed', d.id, err)
          integration.config = {}
        }
      }
      return integration
    })
    .filter((i: CrmIntegration) => i.deleted !== true)

  // Return only public view — configPreview is already redacted, raw config never returned
  return apiSuccess(integrations.map(toPublicView))
})

export const POST = withAuth('client', async (req: NextRequest, user) => {
  const body = await req.json().catch(() => null)
  if (!body) return apiError('Invalid JSON', 400)

  const requestedOrgId = typeof body.orgId === 'string' ? body.orgId.trim() : null
  const scope = resolveOrgScope(user, requestedOrgId)
  if (!scope.ok) return apiError(scope.error, scope.status)
  const orgId = scope.orgId

  const provider = body.provider as CrmIntegrationProvider | undefined
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!provider) return apiError('provider is required', 400)
  if (!name) return apiError('name is required', 400)

  const entry = findProvider(provider)
  if (!entry) return apiError(`Unknown provider: ${provider}`, 400)
  if (entry.comingSoon) return apiError(`${entry.displayName} is not yet available`, 422)

  // Validate provider-specific required config
  const config: Record<string, string> = {}
  for (const field of entry.configFields) {
    const v = body.config?.[field.key]
    if (typeof v !== 'string' || !v.trim()) {
      if (field.required) return apiError(`config.${field.key} is required for ${entry.displayName}`, 400)
      continue
    }
    config[field.key] = v.trim()
  }

  // Encrypt config before persisting — configEnc is stored in Firestore, config stays in-memory only
  const configEnc = encryptCredentials(config, orgId)

  const docRef = await adminDb.collection('crm_integrations').add({
    orgId,
    provider,
    name,
    status: 'pending',
    configEnc,
    autoTags: Array.isArray(body.autoTags) ? body.autoTags : [],
    autoCampaignIds: Array.isArray(body.autoCampaignIds) ? body.autoCampaignIds : [],
    cadenceMinutes: typeof body.cadenceMinutes === 'number' ? body.cadenceMinutes : 0,
    lastSyncedAt: null,
    lastSyncStats: EMPTY_SYNC_STATS,
    lastError: '',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    deleted: false,
  })

  const created = await docRef.get()
  const integration = { id: docRef.id, ...created.data(), config } as CrmIntegration
  return apiSuccess(toPublicView(integration), 201)
})
