import type { AdConversionAction } from '@/lib/ads/types'
import { GOOGLE_ADS_API_BASE_URL } from './constants'
import { sha256Norm } from '@/lib/ads/capi/hash'

interface CallArgs {
  customerId: string
  accessToken: string
  developerToken: string
  loginCustomerId?: string
}
interface GoogleMutateResult { resourceName: string; id: string }

function buildHeaders(args: CallArgs): Record<string, string> {
  const h: Record<string, string> = {
    Authorization: `Bearer ${args.accessToken}`,
    'developer-token': args.developerToken,
    'Content-Type': 'application/json',
  }
  if (args.loginCustomerId) h['login-customer-id'] = args.loginCustomerId
  return h
}

async function googlePost<T>(args: CallArgs & { path: string; body: unknown }): Promise<T> {
  const url = `${GOOGLE_ADS_API_BASE_URL}/customers/${args.customerId}/${args.path}`
  const res = await fetch(url, {
    method: 'POST',
    headers: buildHeaders(args),
    body: JSON.stringify(args.body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Google Ads ${args.path} failed: HTTP ${res.status} — ${text}`)
  }
  return (await res.json()) as T
}

function extractIdFromResourceName(rn: string): string { return rn.split('/').pop() ?? '' }

/** Create a Conversion Action via Google Ads API. */
export async function createConversionAction(args: CallArgs & {
  canonical: AdConversionAction
}): Promise<GoogleMutateResult> {
  if (!args.canonical.name.trim()) throw new Error('Conversion Action name is required')

  const create: Record<string, unknown> = {
    name: args.canonical.name,
    category: args.canonical.category,
    status: 'ENABLED',
    type: 'WEBPAGE',  // default — Google supports WEBPAGE, UPLOAD_CLICKS, UPLOAD_CALLS, etc.
    countingType: args.canonical.countingType,
  }

  if (args.canonical.valueSettings) {
    const valueSettings: Record<string, unknown> = {}
    if (args.canonical.valueSettings.defaultValue !== undefined) {
      valueSettings.defaultValue = args.canonical.valueSettings.defaultValue
    }
    if (args.canonical.valueSettings.defaultCurrencyCode !== undefined) {
      valueSettings.defaultCurrencyCode = args.canonical.valueSettings.defaultCurrencyCode
    }
    if (args.canonical.valueSettings.alwaysUseDefault !== undefined) {
      valueSettings.alwaysUseDefault = args.canonical.valueSettings.alwaysUseDefault
    }
    if (Object.keys(valueSettings).length > 0) {
      create.valueSettings = valueSettings
    }
  }

  if (args.canonical.attributionModel) {
    create.attributionModelSettings = { attributionModel: args.canonical.attributionModel }
  }

  const body = { operations: [{ create }] }
  const res = await googlePost<{ results: Array<{ resourceName: string }> }>({
    ...args,
    path: 'conversionActions:mutate',
    body,
  })
  const resourceName = res.results[0]?.resourceName
  if (!resourceName) throw new Error('Conversion Action creation returned no resourceName')
  return { resourceName, id: extractIdFromResourceName(resourceName) }
}

export async function removeConversionAction(args: CallArgs & { resourceName: string }): Promise<GoogleMutateResult> {
  const body = { operations: [{ remove: args.resourceName }] }
  await googlePost({ ...args, path: 'conversionActions:mutate', body })
  return { resourceName: args.resourceName, id: extractIdFromResourceName(args.resourceName) }
}

export interface EnhancedConversionUserIdentifier {
  email?: string
  phone?: string
  firstName?: string
  lastName?: string
  countryCode?: string
  postalCode?: string
}

export interface EnhancedConversionEvent {
  conversionActionResourceName: string
  conversionDateTime: string  // 'YYYY-MM-DD HH:MM:SS+HH:MM' format per Google spec
  conversionValue?: number
  currencyCode?: string
  orderId?: string  // for dedupe (Google's order_id field)
  userIdentifiers: EnhancedConversionUserIdentifier[]
  gclid?: string  // Google Click ID — when present, no userIdentifiers required
}

/** Upload one or more Enhanced Conversions via :uploadClickConversions endpoint. */
export async function uploadEnhancedConversions(args: CallArgs & {
  events: EnhancedConversionEvent[]
  partialFailure?: boolean
}): Promise<{ uploadedCount: number; partialFailureError?: unknown }> {
  if (args.events.length === 0) throw new Error('At least one event required')

  const conversions = args.events.map((evt) => {
    const conv: Record<string, unknown> = {
      conversionAction: evt.conversionActionResourceName,
      conversionDateTime: evt.conversionDateTime,
    }
    if (evt.conversionValue !== undefined) conv.conversionValue = evt.conversionValue
    if (evt.currencyCode) conv.currencyCode = evt.currencyCode
    if (evt.orderId) conv.orderId = evt.orderId
    if (evt.gclid) conv.gclid = evt.gclid

    const userIdentifiers = evt.userIdentifiers.map((u) => {
      const ui: Record<string, unknown> = {}
      if (u.email) ui.hashedEmail = sha256Norm(u.email)
      if (u.phone) ui.hashedPhoneNumber = sha256Norm(u.phone)
      if (u.firstName || u.lastName || u.countryCode || u.postalCode) {
        const addressInfo: Record<string, string> = {}
        if (u.firstName) addressInfo.hashedFirstName = sha256Norm(u.firstName)!
        if (u.lastName) addressInfo.hashedLastName = sha256Norm(u.lastName)!
        if (u.countryCode) addressInfo.countryCode = u.countryCode
        if (u.postalCode) addressInfo.postalCode = u.postalCode
        ui.addressInfo = addressInfo
      }
      return ui
    }).filter((ui) => Object.keys(ui).length > 0)

    if (userIdentifiers.length > 0) conv.userIdentifiers = userIdentifiers
    return conv
  })

  const body = {
    conversions,
    partialFailure: args.partialFailure ?? true,
    validateOnly: false,
  }

  const res = await googlePost<{ results: Array<unknown>; partialFailureError?: unknown }>({
    ...args,
    path: ':uploadClickConversions',
    body,
  })

  return {
    uploadedCount: (res.results ?? []).length,
    partialFailureError: res.partialFailureError,
  }
}
