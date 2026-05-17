// __tests__/lib/ads/providers/google/audiences/browse-predefined.test.ts
import {
  listAffinityAudiences,
  listInMarketAudiences,
  listDetailedDemographics,
} from '@/lib/ads/providers/google/audiences/browse-predefined'

const BASE_ARGS = {
  customerId: '123456789',
  accessToken: 'test-access-token',
  developerToken: 'test-dev-token',
}

function makeOkFetch(body: unknown) {
  return jest.fn().mockResolvedValue({
    ok: true,
    json: async () => body,
    text: async () => '',
  })
}

beforeEach(() => {
  jest.resetAllMocks()
})

// Test 1: listAffinityAudiences posts to googleAds:search with AFFINITY query
it('listAffinityAudiences posts to googleAds:search with AFFINITY query', async () => {
  global.fetch = makeOkFetch({ results: [] })

  await listAffinityAudiences(BASE_ARGS)

  expect(global.fetch).toHaveBeenCalledTimes(1)
  const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
  expect(url).toContain('/customers/123456789/googleAds:search')
  expect(init.method).toBe('POST')
  const body = JSON.parse(init.body as string)
  expect(body.query).toContain('AFFINITY')
  expect(body.query).toContain('user_interest')
})

// Test 2: listAffinityAudiences maps results to {resourceName, name}
it('listAffinityAudiences maps results to {resourceName, name}', async () => {
  global.fetch = makeOkFetch({
    results: [
      { userInterest: { resourceName: 'customers/123/userInterests/1', name: 'Beauty & Wellness' } },
      { userInterest: { resourceName: 'customers/123/userInterests/2', name: 'Sports & Fitness' } },
    ],
  })

  const result = await listAffinityAudiences(BASE_ARGS)

  expect(result).toHaveLength(2)
  expect(result[0]).toEqual({ resourceName: 'customers/123/userInterests/1', name: 'Beauty & Wellness' })
  expect(result[1]).toEqual({ resourceName: 'customers/123/userInterests/2', name: 'Sports & Fitness' })
})

// Test 3: listAffinityAudiences filters results with missing resourceName/name
it('listAffinityAudiences filters results with missing resourceName or name', async () => {
  global.fetch = makeOkFetch({
    results: [
      { userInterest: { resourceName: 'customers/123/userInterests/1', name: 'Valid Audience' } },
      { userInterest: { resourceName: 'customers/123/userInterests/2' } }, // missing name
      { userInterest: { name: 'Missing Resource Name' } }, // missing resourceName
      { userInterest: undefined }, // missing userInterest entirely
    ],
  })

  const result = await listAffinityAudiences(BASE_ARGS)

  expect(result).toHaveLength(1)
  expect(result[0].name).toBe('Valid Audience')
})

// Test 4: listAffinityAudiences returns empty when no results
it('listAffinityAudiences returns empty array when no results', async () => {
  global.fetch = makeOkFetch({})

  const result = await listAffinityAudiences(BASE_ARGS)

  expect(result).toEqual([])
})

// Test 5: listInMarketAudiences query includes IN_MARKET filter
it('listInMarketAudiences query includes IN_MARKET filter', async () => {
  global.fetch = makeOkFetch({ results: [] })

  await listInMarketAudiences(BASE_ARGS)

  const [, init] = (global.fetch as jest.Mock).mock.calls[0]
  const body = JSON.parse(init.body as string)
  expect(body.query).toContain('IN_MARKET')
  expect(body.query).not.toContain('AFFINITY')
})

// Test 6: listInMarketAudiences returns mapped results
it('listInMarketAudiences returns mapped results', async () => {
  global.fetch = makeOkFetch({
    results: [
      { userInterest: { resourceName: 'customers/123/userInterests/10', name: 'Autos & Vehicles' } },
    ],
  })

  const result = await listInMarketAudiences(BASE_ARGS)

  expect(result).toHaveLength(1)
  expect(result[0]).toEqual({ resourceName: 'customers/123/userInterests/10', name: 'Autos & Vehicles' })
})

// Test 7: listDetailedDemographics query includes taxonomy filter
it('listDetailedDemographics query includes taxonomy filter', async () => {
  global.fetch = makeOkFetch({ results: [] })

  await listDetailedDemographics(BASE_ARGS)

  const [, init] = (global.fetch as jest.Mock).mock.calls[0]
  const body = JSON.parse(init.body as string)
  expect(body.query).toContain('PRODUCTS_AND_SERVICES')
  expect(body.query).toContain('user_interest')
})

// Test 8: listDetailedDemographics returns mapped results
it('listDetailedDemographics returns mapped results', async () => {
  global.fetch = makeOkFetch({
    results: [
      { userInterest: { resourceName: 'customers/123/userInterests/20', name: 'Homeowners' } },
      { userInterest: { resourceName: 'customers/123/userInterests/21', name: 'Parents' } },
    ],
  })

  const result = await listDetailedDemographics(BASE_ARGS)

  expect(result).toHaveLength(2)
  expect(result[0].name).toBe('Homeowners')
  expect(result[1].name).toBe('Parents')
})

// Test 9: Headers include developer-token + login-customer-id when set
it('headers include developer-token and login-customer-id when set', async () => {
  // Without login-customer-id
  global.fetch = makeOkFetch({ results: [] })
  await listAffinityAudiences(BASE_ARGS)
  const [, initWithout] = (global.fetch as jest.Mock).mock.calls[0]
  expect(initWithout.headers['developer-token']).toBe('test-dev-token')
  expect(initWithout.headers['login-customer-id']).toBeUndefined()

  // With login-customer-id
  global.fetch = makeOkFetch({ results: [] })
  await listAffinityAudiences({ ...BASE_ARGS, loginCustomerId: 'mcc-777' })
  const [, initWith] = (global.fetch as jest.Mock).mock.calls[0]
  expect(initWith.headers['developer-token']).toBe('test-dev-token')
  expect(initWith.headers['login-customer-id']).toBe('mcc-777')
})

// Test 10: Throws on non-2xx response
it('throws on non-2xx response', async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: false,
    status: 400,
    text: async () => 'Bad Request',
    json: async () => ({}),
  })

  await expect(listAffinityAudiences(BASE_ARGS)).rejects.toThrow('HTTP 400')
})
