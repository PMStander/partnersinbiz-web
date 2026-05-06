// lib/crm/integrations/types.ts
//
// Per-org CRM integrations — connectors that pull contacts (and eventually
// other entities) from third-party systems on a schedule. Distinct from
// `lib/integrations/` which is for analytics-data adapters (AdSense / GA4 / etc).
//
// Each integration is org-scoped, status-tracked, and runs through a
// per-provider sync handler in `lib/crm/integrations/handlers/<provider>.ts`.
//
// Phase 4 starts with Mailchimp via API key. Gmail / HubSpot OAuth are
// stubbed in the registry but mark themselves as `comingSoon: true` so the
// UI can render them as preview tiles without exposing config forms.
//
// Credentials note: provider config is stored as `Record<string, string>`
// so each handler owns its own keys (e.g. Mailchimp uses { apiKey, listId }).
// Sensitive values should be encrypted at rest in production — for v1 we
// rely on Firestore IAM scoping. A KMS-backed wrapper is a future polish item.

import type { Timestamp } from 'firebase-admin/firestore'
import type { EncryptedCredentials } from '@/lib/integrations/crypto'

export type { EncryptedCredentials }

export type CrmIntegrationProvider = 'mailchimp' | 'hubspot' | 'gmail' | 'zapier'

export type CrmIntegrationStatus =
  | 'pending'        // newly created, never run
  | 'active'         // configured + last sync succeeded
  | 'syncing'        // in-flight sync
  | 'error'          // last sync errored — see lastError
  | 'paused'         // user-paused
  | 'disabled'       // disabled but kept for history

export interface CrmIntegrationSyncStats {
  imported: number          // rows pulled from the provider
  created: number           // brand-new CRM contacts
  updated: number           // existing contacts that gained tags / data
  skipped: number           // duplicates / invalid / opted-out at source
  errored: number           // rows that hit an error during write
}

export const EMPTY_SYNC_STATS: CrmIntegrationSyncStats = {
  imported: 0,
  created: 0,
  updated: 0,
  skipped: 0,
  errored: 0,
}

export interface CrmIntegration {
  id: string
  orgId: string
  provider: CrmIntegrationProvider
  name: string                              // human-readable label
  status: CrmIntegrationStatus
  config: Record<string, string>            // provider-specific (in-memory only, never persisted unencrypted)
  configEnc?: EncryptedCredentials          // AES-256-GCM encrypted config stored in Firestore
  autoTags: string[]                        // tags applied to every imported contact
  autoCampaignIds: string[]                 // active campaigns to enroll new contacts in
  cadenceMinutes: number                    // 0 = manual only
  lastSyncedAt: Timestamp | null
  lastSyncStats: CrmIntegrationSyncStats
  lastError: string                         // empty when no error
  createdAt: Timestamp | null
  updatedAt: Timestamp | null
  deleted?: boolean
}

export type CrmIntegrationInput = Pick<
  CrmIntegration,
  'orgId' | 'provider' | 'name'
> & Partial<Omit<CrmIntegration, 'id' | 'lastSyncStats' | 'createdAt' | 'updatedAt'>>

// Subset returned to the public-facing portal — never includes raw credentials.
export interface PublicCrmIntegrationView {
  id: string
  provider: CrmIntegrationProvider
  name: string
  status: CrmIntegrationStatus
  cadenceMinutes: number
  autoTags: string[]
  autoCampaignIds: string[]
  lastSyncedAt: Timestamp | null
  lastSyncStats: CrmIntegrationSyncStats
  lastError: string
  configPreview: Record<string, string>     // sensitive keys redacted
}

export interface ProviderRegistryEntry {
  provider: CrmIntegrationProvider
  displayName: string
  description: string
  comingSoon: boolean
  configFields: Array<{
    key: string
    label: string
    type: 'text' | 'password'
    placeholder?: string
    required: boolean
    sensitive: boolean                      // hidden in configPreview
    helpText?: string
  }>
}

export const CRM_INTEGRATION_PROVIDERS: ProviderRegistryEntry[] = [
  {
    provider: 'mailchimp',
    displayName: 'Mailchimp',
    description: 'Pull subscribed list members from Mailchimp into your CRM. Auto-tag and optionally enroll into a campaign on import.',
    comingSoon: false,
    configFields: [
      { key: 'apiKey', label: 'API key', type: 'password', placeholder: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx-us21', required: true, sensitive: true, helpText: 'Generate in Mailchimp → Account → Extras → API keys. The data-center suffix (e.g. -us21) is required.' },
      { key: 'listId', label: 'Audience (list) ID', type: 'text', placeholder: 'a1b2c3d4e5', required: true, sensitive: false, helpText: 'Found in Mailchimp → Audience → Settings → Audience name and defaults.' },
    ],
  },
  {
    provider: 'hubspot',
    displayName: 'HubSpot',
    description: 'Pull contacts from your HubSpot CRM into the PiB contact database. Auto-tag and optionally enroll into a campaign on import.',
    comingSoon: false,
    configFields: [
      { key: 'accessToken', label: 'Private App access token', type: 'password', placeholder: 'pat-na1-...', required: true, sensitive: true, helpText: 'Create a Private App in HubSpot → Settings → Integrations → Private Apps. Grant CRM read access (crm.objects.contacts.read).' },
    ],
  },
  {
    provider: 'gmail',
    displayName: 'Google Contacts',
    description: 'Pull contacts from Google Contacts into your CRM. Requires a Google OAuth refresh token with contacts.readonly scope.',
    comingSoon: false,
    configFields: [
      { key: 'refreshToken', label: 'Google OAuth refresh token', type: 'password', placeholder: '1//0g...', required: true, sensitive: true, helpText: 'Obtain via Google OAuth flow with scope "https://www.googleapis.com/auth/contacts.readonly". The refresh token does not expire unless revoked.' },
      { key: 'clientId', label: 'Google OAuth client ID (optional)', type: 'text', placeholder: 'Leave blank to use platform default', required: false, sensitive: false, helpText: 'Leave blank to use the platform-level Google client. Only set this if you have your own Google Cloud project.' },
      { key: 'clientSecret', label: 'Google OAuth client secret (optional)', type: 'password', placeholder: 'Leave blank to use platform default', required: false, sensitive: true, helpText: 'Leave blank to use the platform-level Google client.' },
    ],
  },
  {
    provider: 'zapier',
    displayName: 'Zapier / n8n / Make',
    description: 'Push contacts in from any automation tool. Use a Capture Source of type "api" and POST to the public capture endpoint — no integration record needed.',
    comingSoon: false,
    configFields: [],
  },
]

export function findProvider(provider: CrmIntegrationProvider): ProviderRegistryEntry | null {
  return CRM_INTEGRATION_PROVIDERS.find((p) => p.provider === provider) ?? null
}

// Redact sensitive config values for public-facing views.
export function buildConfigPreview(provider: CrmIntegrationProvider, config: Record<string, string>): Record<string, string> {
  const entry = findProvider(provider)
  if (!entry) return {}
  const out: Record<string, string> = {}
  for (const field of entry.configFields) {
    const v = config[field.key] ?? ''
    if (!v) continue
    if (field.sensitive) {
      // show last 4 chars only, e.g. "•••••us21"
      out[field.key] = v.length > 4 ? `•••••${v.slice(-4)}` : '•••••'
    } else {
      out[field.key] = v
    }
  }
  return out
}

export function toPublicView(integration: CrmIntegration): PublicCrmIntegrationView {
  return {
    id: integration.id,
    provider: integration.provider,
    name: integration.name,
    status: integration.status,
    cadenceMinutes: integration.cadenceMinutes,
    autoTags: integration.autoTags,
    autoCampaignIds: integration.autoCampaignIds,
    lastSyncedAt: integration.lastSyncedAt,
    lastSyncStats: integration.lastSyncStats,
    lastError: integration.lastError,
    configPreview: buildConfigPreview(integration.provider, integration.config),
  }
}
