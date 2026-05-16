// lib/ads/providers/meta/index.ts
import type { AdProvider } from '@/lib/ads/provider'
import { buildAuthorizeUrl, exchangeCode, exchangeForLongLived, refresh } from './oauth'
import { listAdAccounts as listMetaAdAccounts } from './client'

export const metaProvider: AdProvider = {
  platform: 'meta',
  getAuthorizeUrl: buildAuthorizeUrl,
  exchangeCodeForToken: exchangeCode,
  toLongLivedToken: exchangeForLongLived,
  refreshToken: refresh,
  listAdAccounts: listMetaAdAccounts,
}
