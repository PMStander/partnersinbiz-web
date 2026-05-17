// app/api/v1/ads/pixel-configs/[id]/route.ts
import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import {
  getPixelConfig,
  updatePixelConfig,
  deletePixelConfig,
  setPlatformCapiToken,
} from '@/lib/ads/pixel-configs/store'
import type { AdPixelConfig, AdPlatform, UpdateAdPixelConfigInput } from '@/lib/ads/types'

const PLATFORMS: AdPlatform[] = ['meta', 'google', 'linkedin', 'tiktok']

/** Strip capiTokenEnc from every platform slot so secrets never cross the API boundary. */
function stripSecrets(config: AdPixelConfig): AdPixelConfig {
  const copy = { ...config }
  for (const platform of PLATFORMS) {
    if (copy[platform]) {
      const { capiTokenEnc: _removed, ...rest } = copy[platform]!
      copy[platform] = rest as AdPixelConfig[typeof platform]
    }
  }
  return copy
}

export const GET = withAuth(
  'admin',
  async (req: NextRequest, _user: unknown, ctxParams: { params: Promise<{ id: string }> }) => {
    const orgId = req.headers.get('X-Org-Id')
    if (!orgId) return apiError('Missing X-Org-Id header', 400)

    const { id } = await ctxParams.params
    const config = await getPixelConfig(id)

    if (!config) return apiError('Pixel config not found', 404)
    if (config.orgId !== orgId) return apiError('Pixel config not found', 404) // tenant isolation

    return apiSuccess(stripSecrets(config))
  },
)

export const PATCH = withAuth(
  'admin',
  async (req: NextRequest, _user: unknown, ctxParams: { params: Promise<{ id: string }> }) => {
    const orgId = req.headers.get('X-Org-Id')
    if (!orgId) return apiError('Missing X-Org-Id header', 400)

    const { id } = await ctxParams.params
    const config = await getPixelConfig(id)
    if (!config || config.orgId !== orgId) return apiError('Pixel config not found', 404)

    const body = (await req.json()) as UpdateAdPixelConfigInput & {
      meta?: { capiToken?: string; [k: string]: unknown }
      google?: { capiToken?: string; [k: string]: unknown }
      linkedin?: { capiToken?: string; [k: string]: unknown }
      tiktok?: { capiToken?: string; [k: string]: unknown }
    }

    // Extract any plaintext capiTokens per platform, then call setPlatformCapiToken for each
    const capiTokenPromises: Promise<void>[] = []
    for (const platform of PLATFORMS) {
      const slot = body[platform] as { capiToken?: string } | undefined
      if (slot?.capiToken) {
        capiTokenPromises.push(setPlatformCapiToken(id, platform, slot.capiToken))
      }
    }
    if (capiTokenPromises.length > 0) {
      await Promise.all(capiTokenPromises)
    }

    // Strip plaintext capiToken fields before passing to updatePixelConfig
    const sanitisedPatch: UpdateAdPixelConfigInput = { ...body }
    for (const platform of PLATFORMS) {
      const slot = sanitisedPatch[platform] as { capiToken?: string; [k: string]: unknown } | undefined
      if (slot?.capiToken !== undefined) {
        const { capiToken: _removed, ...rest } = slot
        sanitisedPatch[platform] = rest as unknown as AdPixelConfig[typeof platform]
      }
    }

    await updatePixelConfig(id, sanitisedPatch)

    const updated = await getPixelConfig(id)
    return apiSuccess(updated ? stripSecrets(updated) : null)
  },
)

export const DELETE = withAuth(
  'admin',
  async (req: NextRequest, _user: unknown, ctxParams: { params: Promise<{ id: string }> }) => {
    const orgId = req.headers.get('X-Org-Id')
    if (!orgId) return apiError('Missing X-Org-Id header', 400)

    const { id } = await ctxParams.params
    const config = await getPixelConfig(id)
    if (!config || config.orgId !== orgId) return apiError('Pixel config not found', 404)

    await deletePixelConfig(id)
    return apiSuccess({ deleted: true })
  },
)
