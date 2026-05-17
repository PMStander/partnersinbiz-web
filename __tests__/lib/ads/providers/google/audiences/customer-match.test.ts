// __tests__/lib/ads/providers/google/audiences/customer-match.test.ts
import {
  createCustomerMatchList,
  uploadCustomerListMembers,
  removeCustomerMatchList,
} from '@/lib/ads/providers/google/audiences/customer-match'
import { sha256Norm } from '@/lib/ads/capi/hash'

const BASE_ARGS = {
  customerId: '123456789',
  accessToken: 'test-access-token',
  developerToken: 'test-dev-token',
}

const USER_LIST_RN = 'customers/123456789/userLists/999'
const JOB_RN = 'customers/123456789/offlineUserDataJobs/777'

function makeOkFetch(body: unknown) {
  return jest.fn().mockResolvedValue({
    ok: true,
    json: async () => body,
    text: async () => '',
  })
}

function makeUserListFetch() {
  return makeOkFetch({ results: [{ resourceName: USER_LIST_RN }] })
}

/** Returns a fetch mock that responds to 3 sequential calls (create job, addOps, run). */
function makeJobFetch() {
  return jest
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ resourceName: JOB_RN }),
      text: async () => '',
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
      text: async () => '',
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
      text: async () => '',
    })
}

beforeEach(() => {
  jest.resetAllMocks()
})

// Test 1: createCustomerMatchList builds correct body with default uploadKeyType=CONTACT_INFO
it('createCustomerMatchList builds correct body with default uploadKeyType=CONTACT_INFO', async () => {
  global.fetch = makeUserListFetch()

  const result = await createCustomerMatchList({ ...BASE_ARGS, name: 'My CRM List' })

  expect(result.resourceName).toBe(USER_LIST_RN)
  expect(result.id).toBe('999')

  const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
  expect(url).toContain('/userLists:mutate')
  const body = JSON.parse(init.body as string)
  const create = body.operations[0].create
  expect(create.name).toBe('My CRM List')
  expect(create.membershipLifeSpan).toBe(540)
  expect(create.crmBasedUserList.uploadKeyType).toBe('CONTACT_INFO')
  expect(create.crmBasedUserList.dataSourceType).toBe('FIRST_PARTY')
})

// Test 2: createCustomerMatchList honors uploadKeyType: 'CRM_ID'
it('createCustomerMatchList honors uploadKeyType CRM_ID', async () => {
  global.fetch = makeUserListFetch()

  await createCustomerMatchList({ ...BASE_ARGS, name: 'CRM ID List', uploadKeyType: 'CRM_ID' })

  const [, init] = (global.fetch as jest.Mock).mock.calls[0]
  const body = JSON.parse(init.body as string)
  expect(body.operations[0].create.crmBasedUserList.uploadKeyType).toBe('CRM_ID')
})

// Test 3: createCustomerMatchList throws on empty name
it('createCustomerMatchList throws on empty name', async () => {
  global.fetch = makeUserListFetch()
  await expect(createCustomerMatchList({ ...BASE_ARGS, name: '   ' })).rejects.toThrow(
    'Customer Match list name is required'
  )
  expect(global.fetch).not.toHaveBeenCalled()
})

// Test 4: uploadCustomerListMembers issues 3 fetches (create job + addOperations + run)
it('uploadCustomerListMembers issues 3 fetches: create job, addOperations, run', async () => {
  global.fetch = makeJobFetch()

  const result = await uploadCustomerListMembers({
    ...BASE_ARGS,
    userListResourceName: USER_LIST_RN,
    members: [{ email: 'user@example.com' }],
  })

  expect(global.fetch).toHaveBeenCalledTimes(3)
  expect(result.jobResourceName).toBe(JOB_RN)
  expect(result.memberCount).toBe(1)

  const [createUrl] = (global.fetch as jest.Mock).mock.calls[0]
  const [addOpsUrl] = (global.fetch as jest.Mock).mock.calls[1]
  const [runUrl] = (global.fetch as jest.Mock).mock.calls[2]

  expect(createUrl).toContain('offlineUserDataJobs:create')
  expect(addOpsUrl).toContain('offlineUserDataJobs/777:addOperations')
  expect(runUrl).toContain('offlineUserDataJobs/777:run')
})

// Test 5: uploadCustomerListMembers SHA-256 hashes emails
it('uploadCustomerListMembers SHA-256 hashes emails', async () => {
  global.fetch = makeJobFetch()

  const email = 'User@Example.COM'
  await uploadCustomerListMembers({
    ...BASE_ARGS,
    userListResourceName: USER_LIST_RN,
    members: [{ email }],
  })

  const [, addOpsInit] = (global.fetch as jest.Mock).mock.calls[1]
  const body = JSON.parse(addOpsInit.body as string)
  const identifiers = body.operations[0].create.userIdentifiers
  const emailEntry = identifiers.find((id: Record<string, unknown>) => 'hashedEmail' in id)
  expect(emailEntry).toBeDefined()
  expect(emailEntry.hashedEmail).toBe(sha256Norm(email))
})

// Test 6: uploadCustomerListMembers SHA-256 hashes phones
it('uploadCustomerListMembers SHA-256 hashes phones', async () => {
  global.fetch = makeJobFetch()

  const phone = '+27 82 000 0000'
  await uploadCustomerListMembers({
    ...BASE_ARGS,
    userListResourceName: USER_LIST_RN,
    members: [{ phone }],
  })

  const [, addOpsInit] = (global.fetch as jest.Mock).mock.calls[1]
  const body = JSON.parse(addOpsInit.body as string)
  const identifiers = body.operations[0].create.userIdentifiers
  const phoneEntry = identifiers.find((id: Record<string, unknown>) => 'hashedPhoneNumber' in id)
  expect(phoneEntry).toBeDefined()
  expect(phoneEntry.hashedPhoneNumber).toBe(sha256Norm(phone))
})

// Test 7: uploadCustomerListMembers builds addressInfo when firstName/lastName/country/postal supplied
it('uploadCustomerListMembers builds addressInfo for name/country/postal fields', async () => {
  global.fetch = makeJobFetch()

  await uploadCustomerListMembers({
    ...BASE_ARGS,
    userListResourceName: USER_LIST_RN,
    members: [
      { firstName: 'Jane', lastName: 'Doe', countryCode: 'ZA', postalCode: '4000' },
    ],
  })

  const [, addOpsInit] = (global.fetch as jest.Mock).mock.calls[1]
  const body = JSON.parse(addOpsInit.body as string)
  const identifiers = body.operations[0].create.userIdentifiers
  const addrEntry = identifiers.find((id: Record<string, unknown>) => 'addressInfo' in id)
  expect(addrEntry).toBeDefined()
  expect(addrEntry.addressInfo.hashedFirstName).toBe(sha256Norm('Jane'))
  expect(addrEntry.addressInfo.hashedLastName).toBe(sha256Norm('Doe'))
  expect(addrEntry.addressInfo.countryCode).toBe('ZA')
  expect(addrEntry.addressInfo.postalCode).toBe('4000')
})

// Test 8: uploadCustomerListMembers throws on empty members array
it('uploadCustomerListMembers throws on empty members array', async () => {
  global.fetch = makeJobFetch()
  await expect(
    uploadCustomerListMembers({ ...BASE_ARGS, userListResourceName: USER_LIST_RN, members: [] })
  ).rejects.toThrow('At least one member required')
  expect(global.fetch).not.toHaveBeenCalled()
})

// Test 9: removeCustomerMatchList issues remove operation
it('removeCustomerMatchList issues remove operation on userLists:mutate', async () => {
  global.fetch = makeOkFetch({ results: [{ resourceName: USER_LIST_RN }] })

  const result = await removeCustomerMatchList({ ...BASE_ARGS, resourceName: USER_LIST_RN })

  expect(result.resourceName).toBe(USER_LIST_RN)
  expect(result.id).toBe('999')

  const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
  expect(url).toContain('/userLists:mutate')
  const body = JSON.parse(init.body as string)
  expect(body.operations[0].remove).toBe(USER_LIST_RN)
})

// Test 10: Headers include developer-token + login-customer-id when set; throws on non-2xx
it('headers include developer-token and optional login-customer-id; non-2xx throws', async () => {
  // Without login-customer-id
  global.fetch = makeUserListFetch()
  await createCustomerMatchList({ ...BASE_ARGS, name: 'Test List' })
  const [, initWithout] = (global.fetch as jest.Mock).mock.calls[0]
  expect(initWithout.headers['developer-token']).toBe('test-dev-token')
  expect(initWithout.headers['login-customer-id']).toBeUndefined()

  // With login-customer-id
  global.fetch = makeUserListFetch()
  await createCustomerMatchList({ ...BASE_ARGS, loginCustomerId: 'mcc-888', name: 'Test List 2' })
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
  await expect(createCustomerMatchList({ ...BASE_ARGS, name: 'Bad List' })).rejects.toThrow(
    'HTTP 403'
  )
})
