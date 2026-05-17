import { GOOGLE_ADS_API_BASE_URL } from '../constants'
import { sha256Norm } from '@/lib/ads/capi/hash'

interface CallArgs {
  customerId: string
  accessToken: string
  developerToken: string
  loginCustomerId?: string
}
interface GoogleMutateResult { resourceName: string; id: string }

function buildHeaders(args: CallArgs): Record<string, string> {
  const h: Record<string, string> = {
    Authorization: `Bearer ${args.accessToken}`,
    'developer-token': args.developerToken,
    'Content-Type': 'application/json',
  }
  if (args.loginCustomerId) h['login-customer-id'] = args.loginCustomerId
  return h
}

async function googlePost<T>(args: CallArgs & { path: string; body: unknown }): Promise<T> {
  const url = `${GOOGLE_ADS_API_BASE_URL}/customers/${args.customerId}/${args.path}`
  const res = await fetch(url, {
    method: 'POST',
    headers: buildHeaders(args),
    body: JSON.stringify(args.body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Google Ads ${args.path} failed: HTTP ${res.status} — ${text}`)
  }
  return (await res.json()) as T
}

function extractIdFromResourceName(rn: string): string { return rn.split('/').pop() ?? '' }

export type UploadKeyType = 'CONTACT_INFO' | 'CRM_ID' | 'MOBILE_ADVERTISING_ID'

/** Step 1: Create a CRM-based UserList for Customer Match. */
export async function createCustomerMatchList(args: CallArgs & {
  name: string
  description?: string
  uploadKeyType?: UploadKeyType  // default 'CONTACT_INFO'
  membershipLifeSpanDays?: number  // default 540 (Google max)
}): Promise<GoogleMutateResult> {
  if (!args.name.trim()) throw new Error('Customer Match list name is required')

  const body = {
    operations: [
      {
        create: {
          name: args.name,
          description: args.description ?? '',
          membershipLifeSpan: args.membershipLifeSpanDays ?? 540,
          crmBasedUserList: {
            uploadKeyType: args.uploadKeyType ?? 'CONTACT_INFO',
            dataSourceType: 'FIRST_PARTY',
          },
        },
      },
    ],
  }
  const res = await googlePost<{ results: Array<{ resourceName: string }> }>({
    ...args,
    path: 'userLists:mutate',
    body,
  })
  const resourceName = res.results[0]?.resourceName
  if (!resourceName) throw new Error('UserList creation returned no resourceName')
  return { resourceName, id: extractIdFromResourceName(resourceName) }
}

export interface ContactInfoMember {
  email?: string
  phone?: string
  firstName?: string
  lastName?: string
  countryCode?: string  // 2-letter
  postalCode?: string
}

/** Step 2: Upload hashed members to a Customer Match list via an offline user data job.
 *  3 sub-steps: create job → add operations → run job.
 *  Members get SHA-256 hashed (lowercased + trimmed first) before upload. */
export async function uploadCustomerListMembers(args: CallArgs & {
  userListResourceName: string
  members: ContactInfoMember[]
}): Promise<{ jobResourceName: string; memberCount: number }> {
  if (args.members.length === 0) throw new Error('At least one member required')

  // 1. Create job
  const createJobBody = {
    job: {
      type: 'CUSTOMER_MATCH_USER_LIST',
      customerMatchUserListMetadata: { userList: args.userListResourceName },
    },
  }
  const createRes = await googlePost<{ resourceName: string }>({
    ...args,
    path: 'offlineUserDataJobs:create',
    body: createJobBody,
  })
  const jobResourceName = createRes.resourceName
  if (!jobResourceName) throw new Error('offlineUserDataJobs:create returned no resourceName')

  // 2. Hash + build operations
  const operations = args.members.map((m) => {
    const userIdentifiers: Record<string, unknown>[] = []
    if (m.email) userIdentifiers.push({ hashedEmail: sha256Norm(m.email) })
    if (m.phone) userIdentifiers.push({ hashedPhoneNumber: sha256Norm(m.phone) })
    if (m.firstName || m.lastName || m.countryCode || m.postalCode) {
      const addressInfo: Record<string, string> = {}
      if (m.firstName) addressInfo.hashedFirstName = sha256Norm(m.firstName) as string
      if (m.lastName) addressInfo.hashedLastName = sha256Norm(m.lastName) as string
      if (m.countryCode) addressInfo.countryCode = m.countryCode
      if (m.postalCode) addressInfo.postalCode = m.postalCode
      userIdentifiers.push({ addressInfo })
    }
    return { create: { userIdentifiers } }
  })

  await googlePost({
    ...args,
    path: `offlineUserDataJobs/${extractIdFromResourceName(jobResourceName)}:addOperations`,
    body: { operations, enablePartialFailure: true },
  })

  // 3. Run job (fire-and-forget — Google processes async)
  await googlePost({
    ...args,
    path: `offlineUserDataJobs/${extractIdFromResourceName(jobResourceName)}:run`,
    body: {},
  })

  return { jobResourceName, memberCount: args.members.length }
}

export async function removeCustomerMatchList(args: CallArgs & { resourceName: string }): Promise<GoogleMutateResult> {
  const body = { operations: [{ remove: args.resourceName }] }
  await googlePost({ ...args, path: 'userLists:mutate', body })
  return { resourceName: args.resourceName, id: extractIdFromResourceName(args.resourceName) }
}
