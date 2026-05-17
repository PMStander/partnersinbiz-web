import { trackConversion } from '@/lib/ads/capi/track'
import type { CapiEventInput } from '@/lib/ads/capi/types'
import { Timestamp } from 'firebase-admin/firestore'

// ─── Mock: pixel-configs store ───────────────────────────────────────────────

const mockListPixelConfigs = jest.fn()
const mockDecryptPlatformCapiToken = jest.fn()

jest.mock('@/lib/ads/pixel-configs/store', () => ({
  listPixelConfigs: (...args: unknown[]) => mockListPixelConfigs(...args),
  decryptPlatformCapiToken: (...args: unknown[]) => mockDecryptPlatformCapiToken(...args),
}))

// ─── Mock: capi-events store ─────────────────────────────────────────────────

const mockWasEventProcessed = jest.fn()
const mockRecordCapiEvent = jest.fn()

jest.mock('@/lib/ads/capi-events/store', () => ({
  wasEventProcessed: (...args: unknown[]) => mockWasEventProcessed(...args),
  recordCapiEvent: (...args: unknown[]) => mockRecordCapiEvent(...args),
}))

// ─── Mock: Meta CAPI provider ─────────────────────────────────────────────────

const mockSendMetaCapiEvent = jest.fn()

jest.mock('@/lib/ads/providers/meta/capi', () => ({
  sendMetaCapiEvent: (...args: unknown[]) => mockSendMetaCapiEvent(...args),
}))

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ORG_ID = 'org_test_123'

const BASE_INPUT: CapiEventInput = {
  event_id: 'evt_abc001',
  event_name: 'Purchase',
  event_time: 1716000000,
  user: {
    email: 'jane@example.com',
    firstName: 'Jane',
    lastName: 'Doe',
  },
  action_source: 'website',
  opt_out: false,
}

const META_PIXEL_CONFIG = {
  id: 'pxc_meta001',
  orgId: ORG_ID,
  name: 'Test Meta Config',
  eventMappings: [],
  meta: {
    pixelId: 'px_123456',
    capiTokenEnc: { iv: 'aabbcc', ciphertext: 'deadbeef', tag: 'cafebabe' },
  },
  createdBy: 'user_1',
  createdAt: Timestamp.now(),
  updatedAt: Timestamp.now(),
}

const META_GOOGLE_CONFIG = {
  ...META_PIXEL_CONFIG,
  id: 'pxc_multi001',
  google: { pixelId: 'gads_789' },
  linkedin: { pixelId: 'li_456' },
  tiktok: { pixelId: 'tt_321' },
}

const ORG_ONLY_CONFIG = {
  ...META_PIXEL_CONFIG,
  id: 'pxc_orgwide001',
  meta: undefined,
  google: { pixelId: 'gads_org' },
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('trackConversion', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Default: record returns a resolved promise
    mockRecordCapiEvent.mockResolvedValue({})
  })

  // ─── Test 1: Idempotency ───────────────────────────────────────────────────
  it('returns early with alreadyProcessed=true when wasEventProcessed is true — no fanout, no recordCapiEvent call', async () => {
    mockWasEventProcessed.mockResolvedValue(true)

    const result = await trackConversion({ orgId: ORG_ID, input: BASE_INPUT })

    expect(result.event_id).toBe(BASE_INPUT.event_id)
    expect(result.alreadyProcessed).toBe(true)
    expect(result.fanout).toEqual({})
    expect(mockListPixelConfigs).not.toHaveBeenCalled()
    expect(mockSendMetaCapiEvent).not.toHaveBeenCalled()
    expect(mockRecordCapiEvent).not.toHaveBeenCalled()
  })

  // ─── Test 2: No config throws ─────────────────────────────────────────────
  it('throws when no pixel config is found for the org', async () => {
    mockWasEventProcessed.mockResolvedValue(false)
    mockListPixelConfigs.mockResolvedValue([])

    await expect(trackConversion({ orgId: ORG_ID, input: BASE_INPUT })).rejects.toThrow(
      `No pixel config found for org ${ORG_ID}`,
    )

    expect(mockRecordCapiEvent).not.toHaveBeenCalled()
    expect(mockSendMetaCapiEvent).not.toHaveBeenCalled()
  })

  // ─── Test 3: Meta sends successfully ──────────────────────────────────────
  it('fans out to Meta and persists with sent status on success', async () => {
    mockWasEventProcessed.mockResolvedValue(false)
    mockListPixelConfigs.mockResolvedValue([META_PIXEL_CONFIG])
    mockDecryptPlatformCapiToken.mockReturnValue('plaintext_access_token')
    mockSendMetaCapiEvent.mockResolvedValue({ eventsReceived: 1 })

    const result = await trackConversion({ orgId: ORG_ID, input: BASE_INPUT })

    expect(result.alreadyProcessed).toBe(false)
    expect(result.event_id).toBe(BASE_INPUT.event_id)
    expect(result.fanout.meta?.status).toBe('sent')
    expect(result.fanout.meta?.metaResponseId).toBe('1')
    expect(result.fanout.meta?.sentAt).toBeDefined()

    // Verify Meta was called with correct pixel + token
    expect(mockSendMetaCapiEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        pixelId: META_PIXEL_CONFIG.meta.pixelId,
        accessToken: 'plaintext_access_token',
      }),
    )

    // Persisted once
    expect(mockRecordCapiEvent).toHaveBeenCalledTimes(1)
    expect(mockRecordCapiEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event_id: BASE_INPUT.event_id,
        orgId: ORG_ID,
        pixelConfigId: META_PIXEL_CONFIG.id,
        fanout: expect.objectContaining({ meta: expect.objectContaining({ status: 'sent' }) }),
      }),
    )
  })

  // ─── Test 4: Meta failure recorded but doesn't throw ─────────────────────
  it('records Meta failure without throwing, and non-meta platforms still get skipped status', async () => {
    mockWasEventProcessed.mockResolvedValue(false)
    mockListPixelConfigs.mockResolvedValue([META_GOOGLE_CONFIG])
    mockDecryptPlatformCapiToken.mockReturnValue('some_token')
    mockSendMetaCapiEvent.mockRejectedValue(new Error('Meta CAPI failed: Invalid token'))

    const result = await trackConversion({ orgId: ORG_ID, input: BASE_INPUT })

    // Should NOT throw
    expect(result.alreadyProcessed).toBe(false)
    expect(result.fanout.meta?.status).toBe('failed')
    expect(result.fanout.meta?.error).toContain('Invalid token')
    expect(result.fanout.meta?.sentAt).toBeDefined()

    // Other platforms with pixelId get skipped
    expect(result.fanout.google?.status).toBe('skipped')
    expect(result.fanout.linkedin?.status).toBe('skipped')
    expect(result.fanout.tiktok?.status).toBe('skipped')

    // Event is still persisted despite Meta failure
    expect(mockRecordCapiEvent).toHaveBeenCalledTimes(1)
    expect(mockRecordCapiEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        fanout: expect.objectContaining({
          meta: expect.objectContaining({ status: 'failed' }),
          google: expect.objectContaining({ status: 'skipped' }),
        }),
      }),
    )
  })

  // ─── Test 5: Non-meta platforms with pixelId get skipped status ───────────
  it('marks google/linkedin/tiktok as skipped when they have a pixelId configured', async () => {
    // Config has no meta, but has google + linkedin + tiktok
    mockWasEventProcessed.mockResolvedValue(false)
    mockListPixelConfigs.mockResolvedValue([ORG_ONLY_CONFIG])

    const result = await trackConversion({ orgId: ORG_ID, input: BASE_INPUT })

    expect(result.fanout.meta).toBeUndefined() // no meta configured
    expect(result.fanout.google?.status).toBe('skipped')
    expect(result.fanout.google?.sentAt).toBeDefined()

    // Linkedin and tiktok not in ORG_ONLY_CONFIG
    expect(result.fanout.linkedin).toBeUndefined()
    expect(result.fanout.tiktok).toBeUndefined()

    // Meta CAPI was never called
    expect(mockSendMetaCapiEvent).not.toHaveBeenCalled()
    expect(mockRecordCapiEvent).toHaveBeenCalledTimes(1)
  })

  // ─── Test 6: Persisted event has hashed user data, NOT raw PII ────────────
  it('persists hashed user data to recordCapiEvent — never raw PII', async () => {
    mockWasEventProcessed.mockResolvedValue(false)
    mockListPixelConfigs.mockResolvedValue([META_PIXEL_CONFIG])
    mockDecryptPlatformCapiToken.mockReturnValue('token')
    mockSendMetaCapiEvent.mockResolvedValue({ eventsReceived: 1 })

    const inputWithPii: CapiEventInput = {
      ...BASE_INPUT,
      user: {
        email: 'secret@pii.com',
        phone: '+27821234567',
        firstName: 'Secret',
        lastName: 'Person',
      },
    }

    await trackConversion({ orgId: ORG_ID, input: inputWithPii })

    expect(mockRecordCapiEvent).toHaveBeenCalledTimes(1)
    const [recordArgs] = mockRecordCapiEvent.mock.calls

    // userHash must not contain any raw PII strings
    const { userHash } = recordArgs[0]
    expect(JSON.stringify(userHash)).not.toContain('secret@pii.com')
    expect(JSON.stringify(userHash)).not.toContain('+27821234567')
    expect(JSON.stringify(userHash)).not.toContain('Secret')
    expect(JSON.stringify(userHash)).not.toContain('Person')

    // Hashed fields should be 64-char SHA-256 hex
    expect(userHash.em).toMatch(/^[0-9a-f]{64}$/)
    expect(userHash.ph).toMatch(/^[0-9a-f]{64}$/)
    expect(userHash.fn).toMatch(/^[0-9a-f]{64}$/)
    expect(userHash.ln).toMatch(/^[0-9a-f]{64}$/)
  })
})
