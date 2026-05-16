// __tests__/lib/ads/providers/meta/client.test.ts
import { listAdAccounts } from '@/lib/ads/providers/meta/client'

beforeEach(() => {
  global.fetch = jest.fn() as unknown as typeof fetch
})

describe('listAdAccounts', () => {
  it('GETs /me/adaccounts with fields, normalizes to AdAccount[]', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          {
            id: 'act_42',
            name: 'Brand X',
            currency: 'USD',
            timezone_name: 'America/Los_Angeles',
            business: { id: 'biz_1', name: 'Biz' },
            account_status: 1,
          },
          {
            id: 'act_99',
            name: 'Brand Y',
            currency: 'EUR',
            timezone_name: 'Europe/Berlin',
            account_status: 2,
          },
        ],
      }),
    })

    const accounts = await listAdAccounts({ accessToken: 'EAAO_long' })
    expect(accounts).toEqual([
      {
        id: 'act_42',
        name: 'Brand X',
        currency: 'USD',
        timezone: 'America/Los_Angeles',
        businessId: 'biz_1',
        status: 'ACTIVE',
      },
      {
        id: 'act_99',
        name: 'Brand Y',
        currency: 'EUR',
        timezone: 'Europe/Berlin',
        status: 'DISABLED',
      },
    ])

    const url = (global.fetch as jest.Mock).mock.calls[0][0]
    expect(url).toContain('https://graph.facebook.com/v25.0/me/adaccounts')
    expect(url).toContain('fields=id%2Cname%2Ccurrency%2Ctimezone_name%2Cbusiness%2Caccount_status')
    expect(url).toContain('access_token=EAAO_long')
  })

  it('throws on Meta error envelope', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: 'Invalid OAuth access token.', code: 190 } }),
    })
    await expect(listAdAccounts({ accessToken: 'bad' })).rejects.toThrow(/Invalid OAuth/)
  })
})
