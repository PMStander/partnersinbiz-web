import {
  createCustomSegment,
  removeCustomSegment,
} from '@/lib/ads/providers/google/audiences/custom-segments'

global.fetch = jest.fn() as any

const BASE_ARGS = {
  customerId: '1234567890',
  accessToken: 'fake-access-token',
  developerToken: 'fake-dev-token',
}

describe('Google Ads Custom Segment audience helper', () => {
  beforeEach(() => {
    ;(global.fetch as jest.Mock).mockReset()
  })

  it('createCustomSegment with KEYWORD type builds members with {type: KEYWORD, keyword: ...}', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [{ resourceName: 'customers/1234567890/customAudiences/111' }],
      }),
    })

    const result = await createCustomSegment({
      ...BASE_ARGS,
      name: 'Running Shoes Segment',
      type: 'KEYWORD',
      values: ['running shoes', 'marathon training'],
    })

    expect(result.resourceName).toBe('customers/1234567890/customAudiences/111')
    expect(result.id).toBe('111')

    const [, init] = (global.fetch as jest.Mock).mock.calls[0]
    const body = JSON.parse(init.body)
    expect(body.operations[0].create.members).toEqual([
      { type: 'KEYWORD', keyword: 'running shoes' },
      { type: 'KEYWORD', keyword: 'marathon training' },
    ])
  })

  it('createCustomSegment with URL type builds members with {type: URL, url: ...}', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [{ resourceName: 'customers/1234567890/customAudiences/222' }],
      }),
    })

    await createCustomSegment({
      ...BASE_ARGS,
      name: 'Competitor URLs',
      type: 'URL',
      values: ['https://competitor.com', 'https://other.com'],
    })

    const [, init] = (global.fetch as jest.Mock).mock.calls[0]
    const body = JSON.parse(init.body)
    expect(body.operations[0].create.members).toEqual([
      { type: 'URL', url: 'https://competitor.com' },
      { type: 'URL', url: 'https://other.com' },
    ])
  })

  it('createCustomSegment with APP type builds members with {type: APP, app: ...}', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [{ resourceName: 'customers/1234567890/customAudiences/333' }],
      }),
    })

    await createCustomSegment({
      ...BASE_ARGS,
      name: 'Fitness Apps',
      type: 'APP',
      values: ['com.strava.strava', 'com.garmin.connect'],
    })

    const [, init] = (global.fetch as jest.Mock).mock.calls[0]
    const body = JSON.parse(init.body)
    expect(body.operations[0].create.members).toEqual([
      { type: 'APP', app: 'com.strava.strava' },
      { type: 'APP', app: 'com.garmin.connect' },
    ])
  })

  it('createCustomSegment trims whitespace from values', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [{ resourceName: 'customers/1234567890/customAudiences/444' }],
      }),
    })

    await createCustomSegment({
      ...BASE_ARGS,
      name: 'Trimmed Segment',
      type: 'KEYWORD',
      values: ['  running shoes  ', '  marathon  '],
    })

    const [, init] = (global.fetch as jest.Mock).mock.calls[0]
    const body = JSON.parse(init.body)
    expect(body.operations[0].create.members).toEqual([
      { type: 'KEYWORD', keyword: 'running shoes' },
      { type: 'KEYWORD', keyword: 'marathon' },
    ])
  })

  it('createCustomSegment filters out empty strings', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [{ resourceName: 'customers/1234567890/customAudiences/555' }],
      }),
    })

    await createCustomSegment({
      ...BASE_ARGS,
      name: 'Filtered Segment',
      type: 'KEYWORD',
      values: ['running shoes', '', 'marathon', '  '],
    })

    const [, init] = (global.fetch as jest.Mock).mock.calls[0]
    const body = JSON.parse(init.body)
    expect(body.operations[0].create.members).toEqual([
      { type: 'KEYWORD', keyword: 'running shoes' },
      { type: 'KEYWORD', keyword: 'marathon' },
    ])
    expect(body.operations[0].create.members).toHaveLength(2)
  })

  it('createCustomSegment throws on empty name', async () => {
    await expect(
      createCustomSegment({
        ...BASE_ARGS,
        name: '   ',
        type: 'KEYWORD',
        values: ['running shoes'],
      }),
    ).rejects.toThrow('Custom segment name is required')
  })

  it('createCustomSegment throws when all values are empty/whitespace', async () => {
    await expect(
      createCustomSegment({
        ...BASE_ARGS,
        name: 'Valid Name',
        type: 'KEYWORD',
        values: ['', '   ', '  '],
      }),
    ).rejects.toThrow('At least one non-empty value is required')
  })

  it('removeCustomSegment issues remove op; headers include developer-token + login-customer-id; throws on non-2xx', async () => {
    // Test successful remove with login-customer-id header
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [] }),
    })

    const resourceName = 'customers/1234567890/customAudiences/999'
    const result = await removeCustomSegment({
      ...BASE_ARGS,
      loginCustomerId: 'mcc-123',
      resourceName,
    })

    expect(result.resourceName).toBe(resourceName)
    expect(result.id).toBe('999')

    const [, init] = (global.fetch as jest.Mock).mock.calls[0]
    const headers = init.headers as Record<string, string>
    expect(headers['developer-token']).toBe('fake-dev-token')
    expect(headers['login-customer-id']).toBe('mcc-123')

    const body = JSON.parse(init.body)
    expect(body.operations[0].remove).toBe(resourceName)

    // Test non-2xx throws
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => 'bad request',
    })

    await expect(
      removeCustomSegment({ ...BASE_ARGS, resourceName }),
    ).rejects.toThrow(/Google Ads customAudiences mutate failed/)
  })
})
