// __tests__/lib/ads/providers/google/audiences/remarketing.test.ts
import {
  createRemarketingList,
  removeRemarketingList,
} from '@/lib/ads/providers/google/audiences/remarketing'

const BASE_ARGS = {
  customerId: '123456789',
  accessToken: 'test-access-token',
  developerToken: 'test-dev-token',
}

const LIST_RN = 'customers/123456789/userLists/999'

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

// Test 1: createRemarketingList with URL_CONTAINS rule builds correct body
it('createRemarketingList with URL_CONTAINS rule builds correct body', async () => {
  global.fetch = makeFetch(LIST_RN)

  const result = await createRemarketingList({
    ...BASE_ARGS,
    name: 'Visitors — product page',
    rule: { kind: 'URL_CONTAINS', value: '/product' },
  })

  expect(result.resourceName).toBe(LIST_RN)
  expect(result.id).toBe('999')

  const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
  expect(url).toContain('/userLists:mutate')
  const body = JSON.parse(init.body as string)
  const create = body.operations[0].create
  expect(create.name).toBe('Visitors — product page')
  const ruleSpec = create.ruleBasedUserList.flexibleRuleUserList.inclusiveOperands[0].rule
  expect(ruleSpec.ruleItemGroups[0].ruleItems[0].name).toBe('url__')
  expect(ruleSpec.ruleItemGroups[0].ruleItems[0].stringRuleItem.operator).toBe('CONTAINS')
  expect(ruleSpec.ruleItemGroups[0].ruleItems[0].stringRuleItem.value).toBe('/product')
})

// Test 2: createRemarketingList with URL_EQUALS rule
it('createRemarketingList with URL_EQUALS rule builds correct body', async () => {
  global.fetch = makeFetch(LIST_RN)

  await createRemarketingList({
    ...BASE_ARGS,
    name: 'Checkout page visitors',
    rule: { kind: 'URL_EQUALS', value: 'https://example.com/checkout' },
  })

  const [, init] = (global.fetch as jest.Mock).mock.calls[0]
  const body = JSON.parse(init.body as string)
  const create = body.operations[0].create
  const ruleSpec = create.ruleBasedUserList.flexibleRuleUserList.inclusiveOperands[0].rule
  expect(ruleSpec.ruleItemGroups[0].ruleItems[0].name).toBe('url__')
  expect(ruleSpec.ruleItemGroups[0].ruleItems[0].stringRuleItem.operator).toBe('EQUALS')
  expect(ruleSpec.ruleItemGroups[0].ruleItems[0].stringRuleItem.value).toBe('https://example.com/checkout')
})

// Test 3: createRemarketingList with APP_ID rule uses app_id field
it('createRemarketingList with APP_ID rule uses app_id field', async () => {
  global.fetch = makeFetch(LIST_RN)

  await createRemarketingList({
    ...BASE_ARGS,
    name: 'App users',
    rule: { kind: 'APP_ID', value: 'com.example.myapp' },
  })

  const [, init] = (global.fetch as jest.Mock).mock.calls[0]
  const body = JSON.parse(init.body as string)
  const create = body.operations[0].create
  const ruleSpec = create.ruleBasedUserList.flexibleRuleUserList.inclusiveOperands[0].rule
  expect(ruleSpec.ruleItemGroups[0].ruleItems[0].name).toBe('app_id')
  expect(ruleSpec.ruleItemGroups[0].ruleItems[0].stringRuleItem.operator).toBe('EQUALS')
  expect(ruleSpec.ruleItemGroups[0].ruleItems[0].stringRuleItem.value).toBe('com.example.myapp')
})

// Test 4: createRemarketingList throws on empty name
it('createRemarketingList throws on empty name', async () => {
  global.fetch = makeFetch(LIST_RN)
  await expect(
    createRemarketingList({
      ...BASE_ARGS,
      name: '',
      rule: { kind: 'URL_CONTAINS', value: '/shop' },
    })
  ).rejects.toThrow('Remarketing list name is required')
})

// Test 5: createRemarketingList throws on lifespan < 1 or > 540
it('createRemarketingList throws on lifespan out of range', async () => {
  global.fetch = makeFetch(LIST_RN)
  await expect(
    createRemarketingList({
      ...BASE_ARGS,
      name: 'Too short',
      membershipLifeSpanDays: 0,
      rule: { kind: 'URL_CONTAINS', value: '/shop' },
    })
  ).rejects.toThrow('membershipLifeSpanDays must be 1-540, got 0')

  await expect(
    createRemarketingList({
      ...BASE_ARGS,
      name: 'Too long',
      membershipLifeSpanDays: 541,
      rule: { kind: 'URL_CONTAINS', value: '/shop' },
    })
  ).rejects.toThrow('membershipLifeSpanDays must be 1-540, got 541')
})

// Test 6: createRemarketingList default lifespan is 30
it('createRemarketingList defaults membershipLifeSpan to 30', async () => {
  global.fetch = makeFetch(LIST_RN)

  await createRemarketingList({
    ...BASE_ARGS,
    name: 'Default lifespan list',
    rule: { kind: 'URL_STARTS_WITH', value: 'https://example.com' },
  })

  const [, init] = (global.fetch as jest.Mock).mock.calls[0]
  const body = JSON.parse(init.body as string)
  expect(body.operations[0].create.membershipLifeSpan).toBe(30)
})

// Test 7: removeRemarketingList issues remove operation
it('removeRemarketingList issues remove operation with correct resource name', async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ results: [] }),
    text: async () => '',
  })

  const result = await removeRemarketingList({
    ...BASE_ARGS,
    resourceName: LIST_RN,
  })

  expect(result.resourceName).toBe(LIST_RN)
  expect(result.id).toBe('999')

  const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
  expect(url).toContain('/userLists:mutate')
  const body = JSON.parse(init.body as string)
  expect(body.operations[0].remove).toBe(LIST_RN)
})

// Test 8: Headers include developer-token + login-customer-id when set; throws on non-2xx
it('headers include developer-token and login-customer-id when set; throws on non-2xx', async () => {
  // Without login-customer-id
  global.fetch = makeFetch(LIST_RN)
  await createRemarketingList({
    ...BASE_ARGS,
    name: 'Test list',
    rule: { kind: 'URL_CONTAINS', value: '/test' },
  })
  const [, initWithout] = (global.fetch as jest.Mock).mock.calls[0]
  expect(initWithout.headers['developer-token']).toBe('test-dev-token')
  expect(initWithout.headers['login-customer-id']).toBeUndefined()

  // With login-customer-id
  global.fetch = makeFetch(LIST_RN)
  await createRemarketingList({
    ...BASE_ARGS,
    loginCustomerId: 'mcc-777',
    name: 'Test list with MCC',
    rule: { kind: 'URL_CONTAINS', value: '/test' },
  })
  const [, initWith] = (global.fetch as jest.Mock).mock.calls[0]
  expect(initWith.headers['developer-token']).toBe('test-dev-token')
  expect(initWith.headers['login-customer-id']).toBe('mcc-777')

  // Throws on non-2xx
  global.fetch = jest.fn().mockResolvedValue({
    ok: false,
    status: 403,
    text: async () => 'Forbidden',
  })
  await expect(
    createRemarketingList({
      ...BASE_ARGS,
      name: 'Fail list',
      rule: { kind: 'URL_CONTAINS', value: '/fail' },
    })
  ).rejects.toThrow('Google Ads userLists mutate failed: HTTP 403')
})
