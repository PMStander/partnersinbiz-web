// app/api/v1/ads/pixel-configs/route.ts
import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { listPixelConfigs, createPixelConfig, setPlatformCapiToken } from '@/lib/ads/pixel-configs/store'
import type { AdPixelConfig, AdPlatform, CreateAdPixelConfigInput } from '@/lib/ads/types'

const PLATFORMS: AdPlatform[] = ['meta', 'google', 'linkedin', 'tiktok']

/** Strip capiTokenEnc from every platform slot so secrets never cross the API boundary. */
function stripSecrets(config: AdPixelConfig): AdPixelConfig {
  const copy = { ...config }
  for (const platform of PLATFORMS) {
    if (copy[platform]) {
      const { capiTokenEnc: _removed, ...rest } = copy[platform]!
      // Only keep the platform slot if it still has other fields after stripping
      copy[platform] = rest as AdPixelConfig[typeof platform]
    }
  }
  return copy
}

export const GET = withAuth('admin', async (req: NextRequest) => {
  const orgId = req.headers.get('X-Org-Id')
  if (!orgId) return apiError('Missing X-Org-Id header', 400)

  const url = new URL(req.url)
  const propertyId = url.searchParams.get('propertyId') ?? undefined

  const configs = await listPixelConfigs({ orgId, propertyId })
  return apiSuccess(configs.map(stripSecrets))
})

export const POST = withAuth('admin', async (req: NextRequest, user) => {
  const orgId = req.headers.get('X-Org-Id')
  if (!orgId) return apiError('Missing X-Org-Id header', 400)

  const body = (await req.json()) as {
    input?: CreateAdPixelConfigInput & {
      meta?: { capiToken?: string; [k: string]: unknown }
      google?: { capiToken?: string; [k: string]: unknown }
      linkedin?: { capiToken?: string; [k: string]: unknown }
      tiktok?: { capiToken?: string; [k: string]: unknown }
    }
  }

  if (!body.input?.name) {
    return apiError('Missing required field: name', 400)
  }

  const createdBy = (user as { uid?: string }).uid ?? 'unknown'

  // Collect any plaintext tokens before creating (store.createPixelConfig also
  // encrypts inline, but we honour the spec to call setPlatformCapiToken after create
  // for any explicitly-passed plaintext tokens at the top-level).
  const plaintextTokens: Partial<Record<AdPlatform, string>> = {}
  for (const platform of PLATFORMS) {
    const slot = body.input[platform] as { capiToken?: string } | undefined
    if (slot?.capiToken) {
      plaintextTokens[platform] = slot.capiToken
    }
  }

  const config = await createPixelConfig({
    orgId,
    createdBy,
    input: body.input as CreateAdPixelConfigInput,
  })

  // Encrypt any plaintext tokens that arrived at the top level
  const encryptionPromises = (Object.entries(plaintextTokens) as [AdPlatform, string][]).map(
    ([platform, token]) => setPlatformCapiToken(config.id, platform, token),
  )
  if (encryptionPromises.length > 0) {
    await Promise.all(encryptionPromises)
  }

  return apiSuccess(stripSecrets(config), 201)
})
