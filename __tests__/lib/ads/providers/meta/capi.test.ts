// __tests__/lib/ads/providers/meta/capi.test.ts
import { sendMetaCapiEvent } from '@/lib/ads/providers/meta/capi'
import type { SendCapiArgs } from '@/lib/ads/providers/meta/capi'

const BASE_ARGS: SendCapiArgs = {
  pixelId: 'px_abc123',
  accessToken: 'tok_secret',
  event: {
    event_id: 'evt_001',
    event_name: 'Purchase',
    event_time: 1716000000,
    user: { email: 'user@example.com' },
    action_source: 'website',
    userHash: {
      em: 'aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899',
    },
  },
}

describe('sendMetaCapiEvent', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('POSTs to correct URL with access_token query param and user_data in JSON body', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ events_received: 1 }),
    })
    global.fetch = mockFetch

    await sendMetaCapiEvent(BASE_ARGS)

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [calledUrl, calledInit] = mockFetch.mock.calls[0] as [string, RequestInit]

    // URL contains pixelId and encoded access token
    expect(calledUrl).toContain('/px_abc123/events')
    expect(calledUrl).toContain('access_token=tok_secret')

    // Method
    expect(calledInit.method).toBe('POST')

    // Body contains user_data matching userHash
    const parsedBody = JSON.parse(calledInit.body as string)
    expect(parsedBody.data).toHaveLength(1)
    expect(parsedBody.data[0].user_data).toEqual(BASE_ARGS.event.userHash)
    expect(parsedBody.data[0].event_name).toBe('Purchase')
    expect(parsedBody.data[0].event_id).toBe('evt_001')
  })

  it('includes test_event_code in body when provided', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ events_received: 1 }),
    })
    global.fetch = mockFetch

    await sendMetaCapiEvent({ ...BASE_ARGS, testEventCode: 'TEST12345' })

    const [, calledInit] = mockFetch.mock.calls[0] as [string, RequestInit]
    const parsedBody = JSON.parse(calledInit.body as string)
    expect(parsedBody.test_event_code).toBe('TEST12345')
  })

  it('throws on Meta error envelope', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        error: { message: 'Invalid access token', type: 'OAuthException', code: 190 },
      }),
    })
    global.fetch = mockFetch

    await expect(sendMetaCapiEvent(BASE_ARGS)).rejects.toThrow(
      'Meta CAPI failed: Invalid access token',
    )
  })

  it('throws on non-ok HTTP status', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ message: 'Bad Request' }),
    })
    global.fetch = mockFetch

    await expect(sendMetaCapiEvent(BASE_ARGS)).rejects.toThrow('Meta CAPI failed: HTTP 400')
  })
})
