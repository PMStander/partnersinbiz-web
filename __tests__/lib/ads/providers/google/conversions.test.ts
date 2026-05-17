// __tests__/lib/ads/providers/google/conversions.test.ts
import {
  createConversionAction,
  removeConversionAction,
  uploadEnhancedConversions,
} from '@/lib/ads/providers/google/conversions'
import { sha256Norm } from '@/lib/ads/capi/hash'
import type { AdConversionAction } from '@/lib/ads/types'
import type { Timestamp } from 'firebase-admin/firestore'

const BASE_ARGS = {
  customerId: '123456789',
  accessToken: 'test-access-token',
  developerToken: 'test-dev-token',
}

const CONVERSION_ACTION_RN = 'customers/123456789/conversionActions/555'

function makeOkFetch(body: unknown) {
  return jest.fn().mockResolvedValue({
    ok: true,
    json: async () => body,
    text: async () => '',
  })
}

function makeConversionActionFetch() {
  return makeOkFetch({ results: [{ resourceName: CONVERSION_ACTION_RN }] })
}

function makeUploadFetch(results: unknown[] = [{}], partialFailureError?: unknown) {
  const resBody: Record<string, unknown> = { results }
  if (partialFailureError !== undefined) resBody.partialFailureError = partialFailureError
  return makeOkFetch(resBody)
}

function makeCanonical(overrides: Partial<AdConversionAction> = {}): AdConversionAction {
  return {
    id: 'ca-1',
    orgId: 'org-1',
    platform: 'google',
    name: 'Purchase',
    category: 'PURCHASE',
    valueSettings: {},
    countingType: 'ONE_PER_CLICK',
    createdAt: {} as Timestamp,
    updatedAt: {} as Timestamp,
    ...overrides,
  }
}

beforeEach(() => {
  jest.resetAllMocks()
})

// Test 1: createConversionAction happy path — body has correct category + countingType
it('createConversionAction happy path — body has correct category + countingType', async () => {
  global.fetch = makeConversionActionFetch()

  const result = await createConversionAction({
    ...BASE_ARGS,
    canonical: makeCanonical(),
  })

  expect(result.resourceName).toBe(CONVERSION_ACTION_RN)
  expect(result.id).toBe('555')

  const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
  expect(url).toContain('/conversionActions:mutate')
  const body = JSON.parse(init.body as string)
  const create = body.operations[0].create
  expect(create.name).toBe('Purchase')
  expect(create.category).toBe('PURCHASE')
  expect(create.countingType).toBe('ONE_PER_CLICK')
  expect(create.status).toBe('ENABLED')
  expect(create.type).toBe('WEBPAGE')
})

// Test 2: createConversionAction includes valueSettings when supplied
it('createConversionAction includes valueSettings when supplied', async () => {
  global.fetch = makeConversionActionFetch()

  await createConversionAction({
    ...BASE_ARGS,
    canonical: makeCanonical({
      valueSettings: {
        defaultValue: 99.99,
        defaultCurrencyCode: 'ZAR',
        alwaysUseDefault: true,
      },
    }),
  })

  const [, init] = (global.fetch as jest.Mock).mock.calls[0]
  const body = JSON.parse(init.body as string)
  const create = body.operations[0].create
  expect(create.valueSettings).toBeDefined()
  expect(create.valueSettings.defaultValue).toBe(99.99)
  expect(create.valueSettings.defaultCurrencyCode).toBe('ZAR')
  expect(create.valueSettings.alwaysUseDefault).toBe(true)
})

// Test 3: createConversionAction includes attributionModelSettings when supplied
it('createConversionAction includes attributionModelSettings when supplied', async () => {
  global.fetch = makeConversionActionFetch()

  await createConversionAction({
    ...BASE_ARGS,
    canonical: makeCanonical({ attributionModel: 'LAST_CLICK' }),
  })

  const [, init] = (global.fetch as jest.Mock).mock.calls[0]
  const body = JSON.parse(init.body as string)
  const create = body.operations[0].create
  expect(create.attributionModelSettings).toBeDefined()
  expect(create.attributionModelSettings.attributionModel).toBe('LAST_CLICK')
})

// Test 4: createConversionAction throws on empty name
it('createConversionAction throws on empty name', async () => {
  global.fetch = makeConversionActionFetch()

  await expect(
    createConversionAction({
      ...BASE_ARGS,
      canonical: makeCanonical({ name: '   ' }),
    })
  ).rejects.toThrow('Conversion Action name is required')

  expect(global.fetch).not.toHaveBeenCalled()
})

// Test 5: removeConversionAction issues remove operation
it('removeConversionAction issues remove operation on conversionActions:mutate', async () => {
  global.fetch = makeOkFetch({ results: [{ resourceName: CONVERSION_ACTION_RN }] })

  const result = await removeConversionAction({
    ...BASE_ARGS,
    resourceName: CONVERSION_ACTION_RN,
  })

  expect(result.resourceName).toBe(CONVERSION_ACTION_RN)
  expect(result.id).toBe('555')

  const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
  expect(url).toContain('/conversionActions:mutate')
  const body = JSON.parse(init.body as string)
  expect(body.operations[0].remove).toBe(CONVERSION_ACTION_RN)
})

// Test 6: uploadEnhancedConversions happy path — sends conversions array
it('uploadEnhancedConversions happy path — sends conversions array', async () => {
  global.fetch = makeUploadFetch([{}])

  const result = await uploadEnhancedConversions({
    ...BASE_ARGS,
    events: [
      {
        conversionActionResourceName: CONVERSION_ACTION_RN,
        conversionDateTime: '2026-05-17 10:00:00+02:00',
        conversionValue: 199.99,
        currencyCode: 'ZAR',
        orderId: 'order-42',
        userIdentifiers: [{ email: 'user@example.com' }],
      },
    ],
  })

  expect(result.uploadedCount).toBe(1)
  expect(result.partialFailureError).toBeUndefined()

  const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
  expect(url).toContain('/:uploadClickConversions')
  const body = JSON.parse(init.body as string)
  expect(body.conversions).toHaveLength(1)
  const conv = body.conversions[0]
  expect(conv.conversionAction).toBe(CONVERSION_ACTION_RN)
  expect(conv.conversionDateTime).toBe('2026-05-17 10:00:00+02:00')
  expect(conv.conversionValue).toBe(199.99)
  expect(conv.currencyCode).toBe('ZAR')
  expect(conv.orderId).toBe('order-42')
  expect(body.partialFailure).toBe(true)
  expect(body.validateOnly).toBe(false)
})

// Test 7: uploadEnhancedConversions SHA-256 hashes emails + phones
it('uploadEnhancedConversions SHA-256 hashes emails + phones', async () => {
  global.fetch = makeUploadFetch([{}])

  const email = 'User@Example.COM'
  const phone = '+27 82 000 0000'

  await uploadEnhancedConversions({
    ...BASE_ARGS,
    events: [
      {
        conversionActionResourceName: CONVERSION_ACTION_RN,
        conversionDateTime: '2026-05-17 10:00:00+02:00',
        userIdentifiers: [{ email, phone }],
      },
    ],
  })

  const [, init] = (global.fetch as jest.Mock).mock.calls[0]
  const body = JSON.parse(init.body as string)
  const identifiers = body.conversions[0].userIdentifiers
  expect(identifiers).toHaveLength(1)
  expect(identifiers[0].hashedEmail).toBe(sha256Norm(email))
  expect(identifiers[0].hashedPhoneNumber).toBe(sha256Norm(phone))
})

// Test 8: uploadEnhancedConversions builds addressInfo when firstName/lastName/country/postal supplied
it('uploadEnhancedConversions builds addressInfo when firstName/lastName/country/postal supplied', async () => {
  global.fetch = makeUploadFetch([{}])

  await uploadEnhancedConversions({
    ...BASE_ARGS,
    events: [
      {
        conversionActionResourceName: CONVERSION_ACTION_RN,
        conversionDateTime: '2026-05-17 10:00:00+02:00',
        userIdentifiers: [
          { firstName: 'Jane', lastName: 'Doe', countryCode: 'ZA', postalCode: '4000' },
        ],
      },
    ],
  })

  const [, init] = (global.fetch as jest.Mock).mock.calls[0]
  const body = JSON.parse(init.body as string)
  const identifiers = body.conversions[0].userIdentifiers
  expect(identifiers).toHaveLength(1)
  const addrInfo = identifiers[0].addressInfo
  expect(addrInfo).toBeDefined()
  expect(addrInfo.hashedFirstName).toBe(sha256Norm('Jane'))
  expect(addrInfo.hashedLastName).toBe(sha256Norm('Doe'))
  expect(addrInfo.countryCode).toBe('ZA')
  expect(addrInfo.postalCode).toBe('4000')
})

// Test 9: uploadEnhancedConversions throws on empty events array
it('uploadEnhancedConversions throws on empty events array', async () => {
  global.fetch = makeUploadFetch([])

  await expect(
    uploadEnhancedConversions({ ...BASE_ARGS, events: [] })
  ).rejects.toThrow('At least one event required')

  expect(global.fetch).not.toHaveBeenCalled()
})

// Test 10: Headers include developer-token + login-customer-id when set; throws on non-2xx
it('headers include developer-token and optional login-customer-id; non-2xx throws', async () => {
  // Without login-customer-id
  global.fetch = makeConversionActionFetch()
  await createConversionAction({ ...BASE_ARGS, canonical: makeCanonical() })
  const [, initWithout] = (global.fetch as jest.Mock).mock.calls[0]
  expect(initWithout.headers['developer-token']).toBe('test-dev-token')
  expect(initWithout.headers['login-customer-id']).toBeUndefined()

  // With login-customer-id
  global.fetch = makeConversionActionFetch()
  await createConversionAction({
    ...BASE_ARGS,
    loginCustomerId: 'mcc-888',
    canonical: makeCanonical({ name: 'Lead' }),
  })
  const [, initWith] = (global.fetch as jest.Mock).mock.calls[0]
  expect(initWith.headers['developer-token']).toBe('test-dev-token')
  expect(initWith.headers['login-customer-id']).toBe('mcc-888')

  // Non-2xx throws
  global.fetch = jest.fn().mockResolvedValue({
    ok: false,
    status: 403,
    text: async () => 'Forbidden',
    json: async () => ({}),
  })
  await expect(
    createConversionAction({ ...BASE_ARGS, canonical: makeCanonical({ name: 'Bad Action' }) })
  ).rejects.toThrow('HTTP 403')
})
