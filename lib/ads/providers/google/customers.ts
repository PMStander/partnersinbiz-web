// lib/ads/providers/google/customers.ts
//
// Wraps `GET /customers:listAccessibleCustomers` — the entry point used
// after OAuth completes to discover which Customer IDs the connected
// Google account can access. The caller is responsible for refreshing
// the access token and supplying the platform developer token.

import { GOOGLE_ADS_API_BASE_URL } from './constants'

export interface GoogleCustomerSummary {
  /** 10-digit Customer ID with no hyphens. */
  customerId: string
  /** Full resource name, e.g. `customers/1234567890`. */
  resourceName: string
}

export async function listAccessibleCustomers(args: {
  accessToken: string
  developerToken: string
}): Promise<GoogleCustomerSummary[]> {
  const url = `${GOOGLE_ADS_API_BASE_URL}/customers:listAccessibleCustomers`
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${args.accessToken}`,
      'developer-token': args.developerToken,
    },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(
      `Google Ads customer listing failed: HTTP ${res.status} — ${body}`,
    )
  }
  const data = (await res.json()) as { resourceNames?: string[] }
  return (data.resourceNames ?? []).map((rn) => ({
    customerId: rn.replace('customers/', ''),
    resourceName: rn,
  }))
}
