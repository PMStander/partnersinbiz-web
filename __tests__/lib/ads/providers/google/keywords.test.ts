// __tests__/lib/ads/providers/google/keywords.test.ts
import {
  addKeyword,
  addAdGroupNegativeKeyword,
  addCampaignNegativeKeyword,
  removeCriterion,
} from '@/lib/ads/providers/google/keywords'

const BASE_ARGS = {
  customerId: '123456789',
  accessToken: 'test-access-token',
  developerToken: 'test-dev-token',
}

const AD_GROUP_RN = 'customers/123456789/adGroups/111'
const CAMPAIGN_RN = 'customers/123456789/campaigns/222'
const AD_GROUP_CRITERION_RN = 'customers/123456789/adGroupCriteria/111~333'
const CAMPAIGN_CRITERION_RN = 'customers/123456789/campaignCriteria/222~444'

function makeFetch(resourceName: string) {
  return jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ results: [{ resourceName }] }),
    text: async () => '',
  })
}

beforeEach(() => {
  jest.resetAllMocks()
})

// Test 1: addKeyword creates positive keyword on Ad Group
it('addKeyword creates positive keyword on Ad Group', async () => {
  global.fetch = makeFetch(AD_GROUP_CRITERION_RN)

  const result = await addKeyword({
    ...BASE_ARGS,
    adGroupResourceName: AD_GROUP_RN,
    text: 'running shoes',
    matchType: 'EXACT',
  })

  expect(result.resourceName).toBe(AD_GROUP_CRITERION_RN)
  expect(result.id).toBe('111~333')

  const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
  expect(url).toContain('/adGroupCriteria:mutate')
  const body = JSON.parse(init.body as string)
  expect(body.operations[0].create.keyword.text).toBe('running shoes')
  expect(body.operations[0].create.keyword.matchType).toBe('EXACT')
  expect(body.operations[0].create.status).toBe('ENABLED')
  expect(body.operations[0].create.negative).toBeUndefined()
})

// Test 2: addKeyword honors cpcBidMajor: 1.25 → micros '1250000'
it('addKeyword honors cpcBidMajor: 1.25 → "1250000"', async () => {
  global.fetch = makeFetch(AD_GROUP_CRITERION_RN)

  await addKeyword({
    ...BASE_ARGS,
    adGroupResourceName: AD_GROUP_RN,
    text: 'running shoes',
    matchType: 'EXACT',
    cpcBidMajor: 1.25,
  })

  const [, init] = (global.fetch as jest.Mock).mock.calls[0]
  const body = JSON.parse(init.body as string)
  expect(body.operations[0].create.cpcBidMicros).toBe('1250000')
})

// Test 3: addKeyword throws on empty/whitespace text
it('addKeyword throws on empty text', async () => {
  global.fetch = makeFetch(AD_GROUP_CRITERION_RN)
  await expect(
    addKeyword({ ...BASE_ARGS, adGroupResourceName: AD_GROUP_RN, text: '', matchType: 'EXACT' })
  ).rejects.toThrow('Keyword text cannot be empty')
})

it('addKeyword throws on whitespace-only text', async () => {
  global.fetch = makeFetch(AD_GROUP_CRITERION_RN)
  await expect(
    addKeyword({ ...BASE_ARGS, adGroupResourceName: AD_GROUP_RN, text: '   ', matchType: 'EXACT' })
  ).rejects.toThrow('Keyword text cannot be empty')
})

// Test 4: addKeyword trims surrounding whitespace
it('addKeyword trims surrounding whitespace from text', async () => {
  global.fetch = makeFetch(AD_GROUP_CRITERION_RN)

  await addKeyword({
    ...BASE_ARGS,
    adGroupResourceName: AD_GROUP_RN,
    text: '  running shoes  ',
    matchType: 'EXACT',
  })

  const [, init] = (global.fetch as jest.Mock).mock.calls[0]
  const body = JSON.parse(init.body as string)
  expect(body.operations[0].create.keyword.text).toBe('running shoes')
})

// Test 5: addKeyword with PHRASE match type sends correct matchType field
it('addKeyword with PHRASE match type sends correct matchType field', async () => {
  global.fetch = makeFetch(AD_GROUP_CRITERION_RN)

  await addKeyword({
    ...BASE_ARGS,
    adGroupResourceName: AD_GROUP_RN,
    text: 'running shoes',
    matchType: 'PHRASE',
  })

  const [, init] = (global.fetch as jest.Mock).mock.calls[0]
  const body = JSON.parse(init.body as string)
  expect(body.operations[0].create.keyword.matchType).toBe('PHRASE')
})

// Test 6: addAdGroupNegativeKeyword sets negative: true on Ad Group
it('addAdGroupNegativeKeyword sets negative: true on Ad Group', async () => {
  global.fetch = makeFetch(AD_GROUP_CRITERION_RN)

  const result = await addAdGroupNegativeKeyword({
    ...BASE_ARGS,
    adGroupResourceName: AD_GROUP_RN,
    text: 'free',
    matchType: 'BROAD',
  })

  expect(result.resourceName).toBe(AD_GROUP_CRITERION_RN)

  const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
  expect(url).toContain('/adGroupCriteria:mutate')
  const body = JSON.parse(init.body as string)
  expect(body.operations[0].create.negative).toBe(true)
  expect(body.operations[0].create.adGroup).toBe(AD_GROUP_RN)
  expect(body.operations[0].create.keyword.text).toBe('free')
})

// Test 7: addCampaignNegativeKeyword posts to campaignCriteria:mutate
it('addCampaignNegativeKeyword posts to campaignCriteria:mutate', async () => {
  global.fetch = makeFetch(CAMPAIGN_CRITERION_RN)

  const result = await addCampaignNegativeKeyword({
    ...BASE_ARGS,
    campaignResourceName: CAMPAIGN_RN,
    text: 'cheap',
    matchType: 'PHRASE',
  })

  expect(result.resourceName).toBe(CAMPAIGN_CRITERION_RN)
  expect(result.id).toBe('222~444')

  const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
  expect(url).toContain('/campaignCriteria:mutate')
  const body = JSON.parse(init.body as string)
  expect(body.operations[0].create.negative).toBe(true)
  expect(body.operations[0].create.campaign).toBe(CAMPAIGN_RN)
  expect(body.operations[0].create.keyword.text).toBe('cheap')
  expect(body.operations[0].create.keyword.matchType).toBe('PHRASE')
})

// Test 8: removeCriterion routes Ad-Group resource to adGroupCriteria:mutate
it('removeCriterion routes Ad-Group resource to adGroupCriteria:mutate', async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ results: [{ resourceName: AD_GROUP_CRITERION_RN }] }),
    text: async () => '',
  })

  const result = await removeCriterion({
    ...BASE_ARGS,
    resourceName: AD_GROUP_CRITERION_RN,
  })

  expect(result.resourceName).toBe(AD_GROUP_CRITERION_RN)

  const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
  expect(url).toContain('/adGroupCriteria:mutate')
  const body = JSON.parse(init.body as string)
  expect(body.operations[0].remove).toBe(AD_GROUP_CRITERION_RN)
})

// Test 9: removeCriterion routes Campaign resource to campaignCriteria:mutate
it('removeCriterion routes Campaign resource to campaignCriteria:mutate', async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ results: [{ resourceName: CAMPAIGN_CRITERION_RN }] }),
    text: async () => '',
  })

  const result = await removeCriterion({
    ...BASE_ARGS,
    resourceName: CAMPAIGN_CRITERION_RN,
  })

  expect(result.resourceName).toBe(CAMPAIGN_CRITERION_RN)
  expect(result.id).toBe('222~444')

  const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
  expect(url).toContain('/campaignCriteria:mutate')
  const body = JSON.parse(init.body as string)
  expect(body.operations[0].remove).toBe(CAMPAIGN_CRITERION_RN)
})

// Test 10: Headers include developer-token + optional login-customer-id
it('headers include developer-token and optional login-customer-id', async () => {
  global.fetch = makeFetch(AD_GROUP_CRITERION_RN)

  // Without login-customer-id
  await addKeyword({
    ...BASE_ARGS,
    adGroupResourceName: AD_GROUP_RN,
    text: 'shoes',
    matchType: 'BROAD',
  })

  const [, initWithout] = (global.fetch as jest.Mock).mock.calls[0]
  expect(initWithout.headers['developer-token']).toBe('test-dev-token')
  expect(initWithout.headers['login-customer-id']).toBeUndefined()

  // With login-customer-id
  global.fetch = makeFetch(AD_GROUP_CRITERION_RN)
  await addKeyword({
    ...BASE_ARGS,
    loginCustomerId: 'mcc-999',
    adGroupResourceName: AD_GROUP_RN,
    text: 'shoes',
    matchType: 'BROAD',
  })

  const [, initWith] = (global.fetch as jest.Mock).mock.calls[0]
  expect(initWith.headers['developer-token']).toBe('test-dev-token')
  expect(initWith.headers['login-customer-id']).toBe('mcc-999')
})
