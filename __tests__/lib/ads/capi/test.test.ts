import { sendTestEvent } from '@/lib/ads/capi/test'

// Mock the pixel-config store
jest.mock('@/lib/ads/pixel-configs/store', () => ({
  getPixelConfig: jest.fn(),
  decryptPlatformCapiToken: jest.fn(),
}))

// Mock the Meta CAPI provider (owned by Task 8)
jest.mock('@/lib/ads/providers/meta/capi', () => ({
  sendMetaCapiEvent: jest.fn(),
}))

import { getPixelConfig, decryptPlatformCapiToken } from '@/lib/ads/pixel-configs/store'
import { sendMetaCapiEvent } from '@/lib/ads/providers/meta/capi'

const mockGetPixelConfig = getPixelConfig as jest.MockedFunction<typeof getPixelConfig>
const mockDecryptPlatformCapiToken = decryptPlatformCapiToken as jest.MockedFunction<
  typeof decryptPlatformCapiToken
>
const mockSendMetaCapiEvent = sendMetaCapiEvent as jest.MockedFunction<typeof sendMetaCapiEvent>

const MOCK_CONFIG = {
  id: 'pxc_abc123',
  orgId: 'org_test',
  name: 'Test Config',
  meta: {
    pixelId: '123456789',
    capiTokenEnc: { iv: 'abc', tag: 'def', data: 'ghi' },
  },
  eventMappings: [],
  createdBy: 'usr_test',
  createdAt: { toMillis: () => 0 } as any,
  updatedAt: { toMillis: () => 0 } as any,
}

describe('sendTestEvent', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns { sent: true, metaEventsReceived } on success', async () => {
    mockGetPixelConfig.mockResolvedValue(MOCK_CONFIG as any)
    mockDecryptPlatformCapiToken.mockReturnValue('plaintext-capi-token')
    mockSendMetaCapiEvent.mockResolvedValue({ eventsReceived: 1 })

    const result = await sendTestEvent({
      pixelConfigId: 'pxc_abc123',
      testEventCode: 'TEST123',
    })

    expect(result).toEqual({ sent: true, metaEventsReceived: 1 })

    // Verify the testEventCode was forwarded to the Meta provider
    expect(mockSendMetaCapiEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        pixelId: '123456789',
        accessToken: 'plaintext-capi-token',
        testEventCode: 'TEST123',
        event: expect.objectContaining({
          event_name: 'TestEvent',
          action_source: 'system_generated',
          // user hash is present (hashUser was called)
          userHash: expect.objectContaining({
            em: expect.any(String), // test@example.com hashed
          }),
        }),
      }),
    )
  })

  it('throws if pixel config is not found', async () => {
    mockGetPixelConfig.mockResolvedValue(null)

    await expect(
      sendTestEvent({ pixelConfigId: 'pxc_missing', testEventCode: 'TEST123' }),
    ).rejects.toThrow('Pixel config pxc_missing not found')
  })

  it('throws if Meta CAPI token is not configured', async () => {
    const configWithoutMeta = {
      ...MOCK_CONFIG,
      meta: undefined,
    }
    mockGetPixelConfig.mockResolvedValue(configWithoutMeta as any)

    await expect(
      sendTestEvent({ pixelConfigId: 'pxc_abc123', testEventCode: 'TEST123' }),
    ).rejects.toThrow('No Meta CAPI token configured')
  })

  it('returns { sent: false, error } when Meta CAPI call fails (does not throw)', async () => {
    mockGetPixelConfig.mockResolvedValue(MOCK_CONFIG as any)
    mockDecryptPlatformCapiToken.mockReturnValue('plaintext-capi-token')
    mockSendMetaCapiEvent.mockRejectedValue(new Error('Meta CAPI failed: invalid token'))

    const result = await sendTestEvent({
      pixelConfigId: 'pxc_abc123',
      testEventCode: 'TEST123',
    })

    expect(result).toEqual({ sent: false, error: 'Meta CAPI failed: invalid token' })
  })
})
