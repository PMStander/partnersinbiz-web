// __tests__/lib/ads/providers/google/display-targeting.test.ts
import {
  addAudienceCriterion,
  addTopicCriterion,
  addPlacementCriterion,
  removeCriterion,
} from '@/lib/ads/providers/google/display-targeting'

const BASE_ARGS = {
  customerId: '123456789',
  accessToken: 'test-access-token',
  developerToken: 'test-dev-token',
}

const AD_GROUP_RN = 'customers/123456789/adGroups/777'
const USER_LIST_RN = 'customers/123456789/userLists/42'
const USER_INTEREST_RN = 'customers/123456789/userInterests/100'
const TOPIC_RN = 'topicConstants/603'
const CRITERION_RN = 'customers/123456789/adGroupCriteria/777~999'

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

// Test 1: addAudienceCriterion with userLists/... builds userList.userList payload
it('addAudienceCriterion with userLists resource name builds userList.userList payload', async () => {
  global.fetch = makeFetch(CRITERION_RN)

  const result = await addAudienceCriterion({
    ...BASE_ARGS,
    adGroupResourceName: AD_GROUP_RN,
    audienceResourceName: USER_LIST_RN,
  })

  expect(result.resourceName).toBe(CRITERION_RN)
  expect(result.id).toBe('777~999')

  const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
  expect(url).toContain('/adGroupCriteria:mutate')
  const body = JSON.parse(init.body as string)
  const create = body.operations[0].create
  expect(create.adGroup).toBe(AD_GROUP_RN)
  expect(create.userList).toEqual({ userList: USER_LIST_RN })
  expect(create.userInterest).toBeUndefined()
})

// Test 2: addAudienceCriterion with userInterests/... builds userInterest.userInterestCategory payload
it('addAudienceCriterion with userInterests resource name builds userInterest.userInterestCategory payload', async () => {
  global.fetch = makeFetch(CRITERION_RN)

  const result = await addAudienceCriterion({
    ...BASE_ARGS,
    adGroupResourceName: AD_GROUP_RN,
    audienceResourceName: USER_INTEREST_RN,
  })

  expect(result.resourceName).toBe(CRITERION_RN)

  const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
  expect(url).toContain('/adGroupCriteria:mutate')
  const body = JSON.parse(init.body as string)
  const create = body.operations[0].create
  expect(create.adGroup).toBe(AD_GROUP_RN)
  expect(create.userInterest).toEqual({ userInterestCategory: USER_INTEREST_RN })
  expect(create.userList).toBeUndefined()
})

// Test 3: addAudienceCriterion throws on unrecognized resource name
it('addAudienceCriterion throws on unrecognized audience resource name', async () => {
  global.fetch = makeFetch(CRITERION_RN)

  await expect(
    addAudienceCriterion({
      ...BASE_ARGS,
      adGroupResourceName: AD_GROUP_RN,
      audienceResourceName: 'customers/123456789/someOtherResource/55',
    })
  ).rejects.toThrow('Unrecognized audience resource name')
})

// Test 4: addTopicCriterion builds topic.topicConstant payload
it('addTopicCriterion builds topic.topicConstant payload and routes to adGroupCriteria:mutate', async () => {
  global.fetch = makeFetch(CRITERION_RN)

  const result = await addTopicCriterion({
    ...BASE_ARGS,
    adGroupResourceName: AD_GROUP_RN,
    topicResourceName: TOPIC_RN,
  })

  expect(result.resourceName).toBe(CRITERION_RN)
  expect(result.id).toBe('777~999')

  const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
  expect(url).toContain('/adGroupCriteria:mutate')
  const body = JSON.parse(init.body as string)
  const create = body.operations[0].create
  expect(create.adGroup).toBe(AD_GROUP_RN)
  expect(create.topic).toEqual({ topicConstant: TOPIC_RN })
})

// Test 5: addPlacementCriterion builds placement.url payload
it('addPlacementCriterion builds placement.url payload and routes to adGroupCriteria:mutate', async () => {
  global.fetch = makeFetch(CRITERION_RN)

  const result = await addPlacementCriterion({
    ...BASE_ARGS,
    adGroupResourceName: AD_GROUP_RN,
    placementUrl: 'example.com/sports',
  })

  expect(result.resourceName).toBe(CRITERION_RN)
  expect(result.id).toBe('777~999')

  const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
  expect(url).toContain('/adGroupCriteria:mutate')
  const body = JSON.parse(init.body as string)
  const create = body.operations[0].create
  expect(create.adGroup).toBe(AD_GROUP_RN)
  expect(create.placement).toEqual({ url: 'example.com/sports' })
})

// Test 6: addPlacementCriterion throws on empty placementUrl
it('addPlacementCriterion throws on empty placementUrl', async () => {
  global.fetch = makeFetch(CRITERION_RN)

  await expect(
    addPlacementCriterion({
      ...BASE_ARGS,
      adGroupResourceName: AD_GROUP_RN,
      placementUrl: '',
    })
  ).rejects.toThrow('placementUrl cannot be empty')
})

// Test 7: addPlacementCriterion trims surrounding whitespace from placementUrl
it('addPlacementCriterion trims surrounding whitespace from placementUrl', async () => {
  global.fetch = makeFetch(CRITERION_RN)

  await addPlacementCriterion({
    ...BASE_ARGS,
    adGroupResourceName: AD_GROUP_RN,
    placementUrl: '  example.com/sports  ',
  })

  const [, init] = (global.fetch as jest.Mock).mock.calls[0]
  const body = JSON.parse(init.body as string)
  expect(body.operations[0].create.placement.url).toBe('example.com/sports')
})

// Test 8: Headers include developer-token and login-customer-id when set
it('headers include developer-token and optional login-customer-id', async () => {
  global.fetch = makeFetch(CRITERION_RN)

  // Without login-customer-id
  await addTopicCriterion({
    ...BASE_ARGS,
    adGroupResourceName: AD_GROUP_RN,
    topicResourceName: TOPIC_RN,
  })

  const [, initWithout] = (global.fetch as jest.Mock).mock.calls[0]
  expect(initWithout.headers['developer-token']).toBe('test-dev-token')
  expect(initWithout.headers['login-customer-id']).toBeUndefined()

  // With login-customer-id
  global.fetch = makeFetch(CRITERION_RN)
  await addTopicCriterion({
    ...BASE_ARGS,
    loginCustomerId: 'mcc-888',
    adGroupResourceName: AD_GROUP_RN,
    topicResourceName: TOPIC_RN,
  })

  const [, initWith] = (global.fetch as jest.Mock).mock.calls[0]
  expect(initWith.headers['developer-token']).toBe('test-dev-token')
  expect(initWith.headers['login-customer-id']).toBe('mcc-888')
})

// Test 9: Throws on non-2xx response
it('throws on non-2xx HTTP response with status and body in message', async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: false,
    status: 403,
    text: async () => 'Forbidden — developer token not approved',
  })

  await expect(
    addPlacementCriterion({
      ...BASE_ARGS,
      adGroupResourceName: AD_GROUP_RN,
      placementUrl: 'example.com',
    })
  ).rejects.toThrow('Google Ads adGroupCriteria mutate failed: HTTP 403')
})

// Test 10: removeCriterion is re-exported from display-targeting (smoke check)
it('removeCriterion is re-exported and works for ad-group criteria', async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ results: [{ resourceName: CRITERION_RN }] }),
    text: async () => '',
  })

  const result = await removeCriterion({
    ...BASE_ARGS,
    resourceName: CRITERION_RN,
  })

  expect(result.resourceName).toBe(CRITERION_RN)
  expect(result.id).toBe('777~999')

  const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
  expect(url).toContain('/adGroupCriteria:mutate')
  const body = JSON.parse(init.body as string)
  expect(body.operations[0].remove).toBe(CRITERION_RN)
})
