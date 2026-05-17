import { listAccessibleCustomers } from '@/lib/ads/providers/google/customers'

global.fetch = jest.fn() as any

describe('Google Ads customer listing', () => {
  beforeEach(() => {
    ;(global.fetch as jest.Mock).mockReset()
  })

  it('returns Customer IDs from /customers:listAccessibleCustomers', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        resourceNames: ['customers/1234567890', 'customers/9876543210'],
      }),
    })

    const result = await listAccessibleCustomers({
      accessToken: 'fake-access',
      developerToken: 'fake-dev-token',
    })

    expect(result).toEqual([
      { customerId: '1234567890', resourceName: 'customers/1234567890' },
      { customerId: '9876543210', resourceName: 'customers/9876543210' },
    ])

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
    expect(url).toMatch(/customers:listAccessibleCustomers/)
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer fake-access',
    )
    expect((init.headers as Record<string, string>)['developer-token']).toBe(
      'fake-dev-token',
    )
  })

  it('throws on non-2xx response with body in message', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: async () => 'forbidden',
    })

    await expect(
      listAccessibleCustomers({ accessToken: 'fake', developerToken: 'fake' }),
    ).rejects.toThrow(/Google Ads customer listing failed/)
  })

  it('handles empty resourceNames gracefully', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    })
    const result = await listAccessibleCustomers({
      accessToken: 'a',
      developerToken: 'b',
    })
    expect(result).toEqual([])
  })
})
