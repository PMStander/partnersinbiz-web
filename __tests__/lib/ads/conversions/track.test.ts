// __tests__/lib/ads/conversions/track.test.ts
import { trackConversion } from '@/lib/ads/conversions/track'
import type { ConversionEventInput } from '@/lib/ads/conversions/types'
import type { AdConversionAction } from '@/lib/ads/types'
import type { Timestamp } from 'firebase-admin/firestore'

// ─── Mock: firebase/admin (adminDb) ────────────────────────────────────────────

const mockDedupeGet = jest.fn()
const mockDedupeSet = jest.fn()
const mockActionGet = jest.fn()

jest.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: (name: string) => ({
      doc: (id: string) => {
        if (name === 'ad_conversion_events') {
          return { get: mockDedupeGet, set: mockDedupeSet }
        }
        if (name === 'ad_conversion_actions') {
          return { get: mockActionGet }
        }
        return { get: jest.fn().mockResolvedValue({ exists: false, data: () => undefined }) }
      },
    }),
  },
}))

// ─── Mock: lib/ads/capi/track ──────────────────────────────────────────────────

const mockCapiTrackConversion = jest.fn()

jest.mock('@/lib/ads/capi/track', () => ({
  trackConversion: (...args: unknown[]) => mockCapiTrackConversion(...args),
}))

// ─── Mock: lib/ads/connections/store ─────────────────────────────────────────

const mockGetConnection = jest.fn()
const mockDecryptAccessToken = jest.fn()

jest.mock('@/lib/ads/connections/store', () => ({
  getConnection: (...args: unknown[]) => mockGetConnection(...args),
  decryptAccessToken: (...args: unknown[]) => mockDecryptAccessToken(...args),
}))

// ─── Mock: lib/integrations/google_ads/oauth ─────────────────────────────────

const mockReadDeveloperToken = jest.fn()

jest.mock('@/lib/integrations/google_ads/oauth', () => ({
  readDeveloperToken: () => mockReadDeveloperToken(),
}))

// ─── Mock: lib/ads/providers/google/conversions ──────────────────────────────

const mockUploadEnhancedConversions = jest.fn()

jest.mock('@/lib/ads/providers/google/conversions', () => ({
  uploadEnhancedConversions: (...args: unknown[]) => mockUploadEnhancedConversions(...args),
}))

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ORG_ID = 'org_test_01'
const ACTION_ID = 'ca_test_01'
const EVENT_ID = 'evt_test_abc'

const BASE_INPUT: ConversionEventInput = {
  orgId: ORG_ID,
  conversionActionId: ACTION_ID,
  eventId: EVENT_ID,
  eventTime: new Date('2026-05-17T10:00:00.000Z'),
  value: 199.99,
  currency: 'ZAR',
  user: {
    email: 'user@example.com',
    firstName: 'Jane',
    lastName: 'Doe',
    countryCode: 'ZA',
    postalCode: '4000',
  },
}

function makeAction(overrides: Partial<AdConversionAction> = {}): AdConversionAction {
  return {
    id: ACTION_ID,
    orgId: ORG_ID,
    platform: 'meta',
    name: 'Purchase',
    category: 'PURCHASE',
    valueSettings: {},
    countingType: 'ONE_PER_CLICK',
    providerData: {
      meta: { customEventType: 'Purchase', pixelId: 'px_123' },
    },
    createdAt: {} as Timestamp,
    updatedAt: {} as Timestamp,
    ...overrides,
  }
}

function makeGoogleAction(): AdConversionAction {
  return makeAction({
    platform: 'google',
    providerData: {
      google: { conversionActionResourceName: 'customers/111222333/conversionActions/42' },
    },
  })
}

function makeGoogleConnection() {
  return {
    id: 'conn_google_01',
    orgId: ORG_ID,
    platform: 'google',
    status: 'active',
    userId: 'user_1',
    scopes: [],
    adAccounts: [],
    defaultAdAccountId: '111222333',
    tokenType: 'user',
    accessTokenEnc: { iv: 'iv', ciphertext: 'ct', tag: 'tag' },
    expiresAt: {} as Timestamp,
    createdAt: {} as Timestamp,
    updatedAt: {} as Timestamp,
    meta: { loginCustomerId: '999888777' },
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('trackConversion (cross-platform fanout)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockDedupeSet.mockResolvedValue(undefined)
    mockCapiTrackConversion.mockResolvedValue({ event_id: EVENT_ID, alreadyProcessed: false, fanout: {} })
    mockUploadEnhancedConversions.mockResolvedValue({ uploadedCount: 1 })
    mockDecryptAccessToken.mockReturnValue('goog_access_token')
    mockReadDeveloperToken.mockReturnValue('dev-token-xyz')
  })

  // ─── Test 1: Dedupe returns prior result when eventId already in ad_conversion_events ─
  it('returns dedupe result (skipped) when eventId already in ad_conversion_events', async () => {
    mockDedupeGet.mockResolvedValue({
      exists: true,
      data: () => ({ meta: 'sent', google: 'sent', orgId: ORG_ID }),
    })

    const result = await trackConversion(BASE_INPUT)

    expect(result.meta).toBe('sent')
    expect(result.google).toBe('sent')

    // Should not call action lookup or any fanout
    expect(mockActionGet).not.toHaveBeenCalled()
    expect(mockCapiTrackConversion).not.toHaveBeenCalled()
    expect(mockUploadEnhancedConversions).not.toHaveBeenCalled()
  })

  // ─── Test 2: Throws when conversion action not found ──────────────────────
  it('throws when conversion action not found', async () => {
    mockDedupeGet.mockResolvedValue({ exists: false })
    mockActionGet.mockResolvedValue({ exists: false, data: () => undefined })

    await expect(trackConversion(BASE_INPUT)).rejects.toThrow(
      `Conversion Action not found: ${ACTION_ID}`,
    )

    expect(mockCapiTrackConversion).not.toHaveBeenCalled()
  })

  // ─── Test 3: Throws when conversion action belongs to different org ─────────
  it('throws when conversion action belongs to a different org', async () => {
    mockDedupeGet.mockResolvedValue({ exists: false })
    mockActionGet.mockResolvedValue({
      exists: true,
      data: () => makeAction({ orgId: 'org_OTHER' }),
    })

    await expect(trackConversion(BASE_INPUT)).rejects.toThrow(
      'Conversion Action belongs to a different org',
    )

    expect(mockCapiTrackConversion).not.toHaveBeenCalled()
  })

  // ─── Test 4: Meta-platform action → calls CAPI trackConversion + returns {meta:'sent'} ─
  it('Meta-platform action calls CAPI trackConversion and returns {meta:"sent"}', async () => {
    mockDedupeGet.mockResolvedValue({ exists: false })
    mockActionGet.mockResolvedValue({ exists: true, data: () => makeAction() })
    mockCapiTrackConversion.mockResolvedValue({ event_id: EVENT_ID, alreadyProcessed: false, fanout: { meta: { status: 'sent' } } })

    const result = await trackConversion(BASE_INPUT)

    expect(result.meta).toBe('sent')
    expect(result.google).toBeUndefined()

    // CAPI trackConversion called once with correct orgId + event_id
    expect(mockCapiTrackConversion).toHaveBeenCalledTimes(1)
    const [capiArgs] = mockCapiTrackConversion.mock.calls
    expect(capiArgs[0].orgId).toBe(ORG_ID)
    expect(capiArgs[0].input.event_id).toBe(EVENT_ID)
    // event_time should be unix seconds
    expect(capiArgs[0].input.event_time).toBe(Math.floor(BASE_INPUT.eventTime.getTime() / 1000))

    // Google not called
    expect(mockUploadEnhancedConversions).not.toHaveBeenCalled()

    // Dedupe persisted
    expect(mockDedupeSet).toHaveBeenCalledTimes(1)
    const [setData] = mockDedupeSet.mock.calls[0]
    expect(setData.meta).toBe('sent')
    expect(setData.platform).toBe('meta')
  })

  // ─── Test 5: Google-platform action → calls uploadEnhancedConversions + returns {google:'sent'} ─
  it('Google-platform action calls uploadEnhancedConversions and returns {google:"sent"}', async () => {
    mockDedupeGet.mockResolvedValue({ exists: false })
    mockActionGet.mockResolvedValue({ exists: true, data: () => makeGoogleAction() })
    mockGetConnection.mockResolvedValue(makeGoogleConnection())

    const result = await trackConversion({ ...BASE_INPUT, gclid: 'gclid_abc123' })

    expect(result.google).toBe('sent')
    expect(result.meta).toBeUndefined()

    expect(mockUploadEnhancedConversions).toHaveBeenCalledTimes(1)
    const [uploadArgs] = mockUploadEnhancedConversions.mock.calls
    expect(uploadArgs[0].customerId).toBe('111222333')
    expect(uploadArgs[0].accessToken).toBe('goog_access_token')
    expect(uploadArgs[0].developerToken).toBe('dev-token-xyz')
    expect(uploadArgs[0].loginCustomerId).toBe('999888777')
    const evt = uploadArgs[0].events[0]
    expect(evt.conversionActionResourceName).toBe('customers/111222333/conversionActions/42')
    expect(evt.orderId).toBe(EVENT_ID)
    expect(evt.gclid).toBe('gclid_abc123')
    // conversionDateTime must be in 'YYYY-MM-DD HH:MM:SS+00:00' format
    expect(evt.conversionDateTime).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\+00:00$/)

    // Dedupe persisted
    expect(mockDedupeSet).toHaveBeenCalledTimes(1)
    const [setData] = mockDedupeSet.mock.calls[0]
    expect(setData.google).toBe('sent')
    expect(setData.platform).toBe('google')
  })

  // ─── Test 6: Meta failure marks {meta:'failed', metaError:'...'} ───────────
  it('Meta failure marks meta:failed with metaError without throwing', async () => {
    mockDedupeGet.mockResolvedValue({ exists: false })
    mockActionGet.mockResolvedValue({ exists: true, data: () => makeAction() })
    mockCapiTrackConversion.mockRejectedValue(new Error('Meta CAPI: invalid token'))

    const result = await trackConversion(BASE_INPUT)

    expect(result.meta).toBe('failed')
    expect(result.metaError).toContain('Meta CAPI: invalid token')
    expect(result.google).toBeUndefined()

    // Dedupe still persisted after failure
    expect(mockDedupeSet).toHaveBeenCalledTimes(1)
    const [setData] = mockDedupeSet.mock.calls[0]
    expect(setData.meta).toBe('failed')
  })

  // ─── Test 7: Google failure marks {google:'failed', googleError:'...'} ──────
  it('Google failure marks google:failed with googleError without throwing', async () => {
    mockDedupeGet.mockResolvedValue({ exists: false })
    mockActionGet.mockResolvedValue({ exists: true, data: () => makeGoogleAction() })
    mockGetConnection.mockResolvedValue(makeGoogleConnection())
    mockUploadEnhancedConversions.mockRejectedValue(new Error('Google Ads: quota exceeded'))

    const result = await trackConversion(BASE_INPUT)

    expect(result.google).toBe('failed')
    expect(result.googleError).toContain('Google Ads: quota exceeded')
    expect(result.meta).toBeUndefined()

    // Dedupe still persisted
    expect(mockDedupeSet).toHaveBeenCalledTimes(1)
    const [setData] = mockDedupeSet.mock.calls[0]
    expect(setData.google).toBe('failed')
  })

  // ─── Test 8: Persists dedupe doc with platform + firstSeenAt after fanout ───
  it('persists dedupe doc with orgId, conversionActionId, platform, firstSeenAt after fanout', async () => {
    mockDedupeGet.mockResolvedValue({ exists: false })
    mockActionGet.mockResolvedValue({ exists: true, data: () => makeAction() })
    mockCapiTrackConversion.mockResolvedValue({ event_id: EVENT_ID, alreadyProcessed: false, fanout: {} })

    await trackConversion(BASE_INPUT)

    expect(mockDedupeSet).toHaveBeenCalledTimes(1)
    const [setArg] = mockDedupeSet.mock.calls[0]
    expect(setArg.orgId).toBe(ORG_ID)
    expect(setArg.conversionActionId).toBe(ACTION_ID)
    expect(setArg.platform).toBe('meta')
    expect(setArg.firstSeenAt).toBeInstanceOf(Date)
  })
})
