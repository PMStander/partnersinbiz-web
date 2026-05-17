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
  const url = `${GOOGLE_ADS_API_BASE_URL}/customers/${args.customerId}/userLists:mutate`
  const res = await fetch(url, {
    method: 'POST',
    headers: buildHeaders(args),
    body: JSON.stringify(args.body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Google Ads userLists mutate failed: HTTP ${res.status} — ${text}`)
  }
  return (await res.json()) as T
}

function extractIdFromResourceName(rn: string): string { return rn.split('/').pop() ?? '' }

export type RemarketingRule =
  | { kind: 'URL_CONTAINS'; value: string }
  | { kind: 'URL_EQUALS'; value: string }
  | { kind: 'URL_STARTS_WITH'; value: string }
  | { kind: 'APP_ID'; value: string }

/** Build a Google rule-based user list spec from a simple rule input. */
function buildRuleSpec(rule: RemarketingRule) {
  switch (rule.kind) {
    case 'URL_CONTAINS':
      return {
        ruleType: 'OR',
        ruleItemGroups: [
          { ruleItems: [{ name: 'url__', stringRuleItem: { operator: 'CONTAINS', value: rule.value } }] },
        ],
      }
    case 'URL_EQUALS':
      return {
        ruleType: 'OR',
        ruleItemGroups: [
          { ruleItems: [{ name: 'url__', stringRuleItem: { operator: 'EQUALS', value: rule.value } }] },
        ],
      }
    case 'URL_STARTS_WITH':
      return {
        ruleType: 'OR',
        ruleItemGroups: [
          { ruleItems: [{ name: 'url__', stringRuleItem: { operator: 'STARTS_WITH', value: rule.value } }] },
        ],
      }
    case 'APP_ID':
      // App-based retargeting uses a different rule structure
      return {
        ruleType: 'OR',
        ruleItemGroups: [
          { ruleItems: [{ name: 'app_id', stringRuleItem: { operator: 'EQUALS', value: rule.value } }] },
        ],
      }
  }
}

/** Create a Remarketing UserList from a website or app rule. */
export async function createRemarketingList(args: CallArgs & {
  name: string
  description?: string
  membershipLifeSpanDays?: number  // default 30
  rule: RemarketingRule
}): Promise<GoogleMutateResult> {
  if (!args.name.trim()) throw new Error('Remarketing list name is required')

  const lifespan = args.membershipLifeSpanDays ?? 30
  if (lifespan < 1 || lifespan > 540) {
    throw new Error(`membershipLifeSpanDays must be 1-540, got ${lifespan}`)
  }

  const body = {
    operations: [
      {
        create: {
          name: args.name,
          description: args.description ?? '',
          membershipLifeSpan: lifespan,
          ruleBasedUserList: {
            flexibleRuleUserList: {
              inclusiveRuleOperator: 'AND',
              inclusiveOperands: [
                {
                  rule: buildRuleSpec(args.rule),
                },
              ],
            },
          },
        },
      },
    ],
  }
  const res = await googleMutate<{ results: Array<{ resourceName: string }> }>({ ...args, body })
  const resourceName = res.results[0]?.resourceName
  if (!resourceName) throw new Error('Remarketing list creation returned no resourceName')
  return { resourceName, id: extractIdFromResourceName(resourceName) }
}

export async function removeRemarketingList(args: CallArgs & { resourceName: string }): Promise<GoogleMutateResult> {
  const body = { operations: [{ remove: args.resourceName }] }
  await googleMutate({ ...args, body })
  return { resourceName: args.resourceName, id: extractIdFromResourceName(args.resourceName) }
}
