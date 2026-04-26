// lib/integrations/app_store_connect/index.ts
//
// Apple App Store Connect adapter.
//
// Auth: signed JWT (ES256) — no OAuth. The user creates an API key in
//   App Store Connect → Users and Access → Keys → App Store Connect API
// and gives us three things, plus their numeric vendor number:
//   - keyId        (10-char, e.g. 'X9Y8Z7W6V5')
//   - issuerId     (UUID)
//   - privateKey   (PEM-encoded ES256 private key — `.p8` file contents)
//   - vendorNumber (from Reports → Sales and Trends — the "Vendor #" header)
//
// Daily pull: GET /v1/salesReports (DAILY / SUMMARY / SALES). Response is
// gzipped TSV; we decode + parse + aggregate.
//
// We register the adapter with the central registry on import (the registry
// imports this module, not the other way around).

import { upsertConnection } from '@/lib/integrations/connections'
import { registerAdapter } from '@/lib/integrations/registry'
import type { Connection, IntegrationAdapter } from '@/lib/integrations/types'
import { pullDaily } from './pull-daily'
import type { AscCredentials, AscMeta } from './schema'

/** Validate the saveCredentials payload — throws with a clear message. */
function validateSavePayload(payload: Record<string, unknown>): {
  credentials: AscCredentials
  vendorNumber: string
} {
  const keyId = typeof payload.keyId === 'string' ? payload.keyId.trim() : ''
  const issuerId = typeof payload.issuerId === 'string' ? payload.issuerId.trim() : ''
  const privateKey = typeof payload.privateKey === 'string' ? payload.privateKey : ''
  const vendorNumber =
    typeof payload.vendorNumber === 'string'
      ? payload.vendorNumber.trim()
      : typeof payload.vendorNumber === 'number'
        ? String(payload.vendorNumber)
        : ''

  if (!keyId) throw new Error('App Store Connect: keyId is required')
  if (!issuerId) throw new Error('App Store Connect: issuerId is required')
  if (!privateKey || !privateKey.includes('PRIVATE KEY')) {
    throw new Error(
      'App Store Connect: privateKey must be a PEM-encoded ES256 private key (the contents of your .p8 file)',
    )
  }
  if (!vendorNumber) {
    throw new Error(
      'App Store Connect: vendorNumber is required (find it under Reports → Sales and Trends in App Store Connect)',
    )
  }

  return {
    credentials: { keyId, issuerId, privateKey },
    vendorNumber,
  }
}

const adapter: IntegrationAdapter = {
  provider: 'app_store_connect',
  authKind: 'jwt',

  display: {
    name: 'Apple App Store Connect',
    description:
      'Pulls daily app installs, IAP revenue, and total revenue from Apple Sales Reports.',
    iconKey: 'apple',
    docsUrl: 'https://developer.apple.com/documentation/appstoreconnectapi',
    consoleUrl: 'https://appstoreconnect.apple.com/access/integrations/api',
  },

  async saveCredentials(input): Promise<Connection> {
    const { credentials, vendorNumber } = validateSavePayload(input.payload)
    const meta: AscMeta = { vendorNumber }
    return upsertConnection({
      propertyId: input.propertyId,
      orgId: input.orgId,
      provider: 'app_store_connect',
      authKind: 'jwt',
      credentials: credentials as unknown as Record<string, unknown>,
      meta: meta as unknown as Record<string, unknown>,
      status: 'connected',
      createdBy: 'system',
      createdByType: 'system',
    })
  },

  async pullDaily(input) {
    return pullDaily(input)
  },
}

registerAdapter(adapter)

export default adapter
export { adapter }
