import { GOOGLE_ADS_API_BASE_URL } from '../constants'

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

async function googleMutate<T>(args: CallArgs & { body: unknown }): Promise<T> {
  const url = `${GOOGLE_ADS_API_BASE_URL}/customers/${args.customerId}/customAudiences:mutate`
  const res = await fetch(url, {
    method: 'POST',
    headers: buildHeaders(args),
    body: JSON.stringify(args.body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Google Ads customAudiences mutate failed: HTTP ${res.status} — ${text}`)
  }
  return (await res.json()) as T
}

function extractIdFromResourceName(rn: string): string { return rn.split('/').pop() ?? '' }

export type CustomSegmentType = 'KEYWORD' | 'URL' | 'APP'

/** Map a value into the Google customAudience member shape based on segment type. */
function buildMember(type: CustomSegmentType, value: string): Record<string, unknown> {
  switch (type) {
    case 'KEYWORD':
      return { type: 'KEYWORD', keyword: value.trim() }
    case 'URL':
      return { type: 'URL', url: value.trim() }
    case 'APP':
      return { type: 'APP', app: value.trim() }
  }
}

/** Create a Custom Audience (Custom Segment) from KEYWORD/URL/APP values. */
export async function createCustomSegment(args: CallArgs & {
  name: string
  description?: string
  type: CustomSegmentType
  values: string[]
}): Promise<GoogleMutateResult> {
  if (!args.name.trim()) throw new Error('Custom segment name is required')
  if (args.values.length === 0) throw new Error('At least one value is required')
  const cleaned = args.values.map((v) => v.trim()).filter((v) => v.length > 0)
  if (cleaned.length === 0) throw new Error('At least one non-empty value is required')

  const body = {
    operations: [
      {
        create: {
          name: args.name,
          description: args.description ?? '',
          type: 'AUTO',  // Google auto-classifies based on members
          members: cleaned.map((v) => buildMember(args.type, v)),
        },
      },
    ],
  }
  const res = await googleMutate<{ results: Array<{ resourceName: string }> }>({ ...args, body })
  const resourceName = res.results[0]?.resourceName
  if (!resourceName) throw new Error('Custom segment creation returned no resourceName')
  return { resourceName, id: extractIdFromResourceName(resourceName) }
}

export async function removeCustomSegment(args: CallArgs & { resourceName: string }): Promise<GoogleMutateResult> {
  const body = { operations: [{ remove: args.resourceName }] }
  await googleMutate({ ...args, body })
  return { resourceName: args.resourceName, id: extractIdFromResourceName(args.resourceName) }
}
