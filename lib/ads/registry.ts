// lib/ads/registry.ts
import type { AdProvider } from './provider'
import { UnknownProviderError } from './provider'
import type { AdPlatform } from './types'
import { isAdPlatform } from './types'

import { metaProvider } from './providers/meta'
import { googleProvider } from './providers/google'
import { linkedinProvider } from './providers/linkedin'
import { tiktokProvider } from './providers/tiktok'

const PROVIDERS: Record<AdPlatform, AdProvider> = {
  meta: metaProvider,
  google: googleProvider,
  linkedin: linkedinProvider,
  tiktok: tiktokProvider,
}

export function getProvider(platform: AdPlatform): AdProvider {
  if (!isAdPlatform(platform)) throw new UnknownProviderError(String(platform))
  return PROVIDERS[platform]
}
