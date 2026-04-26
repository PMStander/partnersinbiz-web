// lib/integrations/revenuecat/client.ts
//
// Thin authenticated REST client for RevenueCat. Uses native fetch — no SDK.
// RevenueCat exposes:
//   - v1 API at https://api.revenuecat.com/v1   (subscribers, etc.)
//   - v2 API at https://api.revenuecat.com/v2   (projects, apps, metrics)
//
// Auth is the same for both: `Authorization: Bearer ${apiKey}` where apiKey
// is the project-level secret REST key issued by RevenueCat.
//
// All methods return parsed JSON or throw a `RevenueCatApiError` with the
// HTTP status attached. Callers decide whether to swallow expected 4xx
// (auth/permission) and bubble up unexpected 5xx.

import type {
  RevenueCatMetricsResponse,
  RevenueCatSubscriberResponse,
} from './schema'

export const REVENUECAT_BASE_URL = 'https://api.revenuecat.com'

export class RevenueCatApiError extends Error {
  status: number
  body: string
  constructor(status: number, message: string, body = '') {
    super(message)
    this.name = 'RevenueCatApiError'
    this.status = status
    this.body = body
  }
}

export interface RevenueCatClient {
  /** GET /v2/projects/{projectId}/metrics — overview metrics. */
  getProjectMetrics: (input: {
    projectId: string
    /** Optional ISO date — RevenueCat treats this as the period end. */
    endDate?: string
    /** Optional ISO date — period start. */
    startDate?: string
  }) => Promise<RevenueCatMetricsResponse>

  /** GET /v1/subscribers/{appUserId} — used as an auth/sanity probe. */
  getSubscriber: (appUserId: string) => Promise<RevenueCatSubscriberResponse>

  /** Low-level escape hatch — exposed for adapters that need a raw call. */
  request: <T = unknown>(
    method: string,
    path: string,
    init?: { query?: Record<string, string | undefined>; body?: unknown },
  ) => Promise<T>
}

export function createRevenueCatClient(input: {
  apiKey: string
  /** Override for tests. */
  baseUrl?: string
  /** Optional — pinned to a specific version of the API. */
  apiVersion?: string
}): RevenueCatClient {
  const baseUrl = (input.baseUrl ?? REVENUECAT_BASE_URL).replace(/\/$/, '')

  async function request<T>(
    method: string,
    path: string,
    init: { query?: Record<string, string | undefined>; body?: unknown } = {},
  ): Promise<T> {
    const url = new URL(baseUrl + path)
    if (init.query) {
      for (const [k, v] of Object.entries(init.query)) {
        if (v != null && v !== '') url.searchParams.set(k, v)
      }
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${input.apiKey}`,
      Accept: 'application/json',
    }
    if (input.apiVersion) headers['X-Platform'] = input.apiVersion
    if (init.body !== undefined) headers['Content-Type'] = 'application/json'

    const res = await fetch(url.toString(), {
      method,
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    })

    const text = await res.text()
    if (!res.ok) {
      throw new RevenueCatApiError(
        res.status,
        `RevenueCat ${method} ${path} failed: ${res.status} ${res.statusText}`,
        text,
      )
    }
    if (!text) return undefined as T
    try {
      return JSON.parse(text) as T
    } catch {
      throw new RevenueCatApiError(
        res.status,
        `RevenueCat ${method} ${path} returned invalid JSON`,
        text,
      )
    }
  }

  return {
    request,

    async getProjectMetrics({ projectId, startDate, endDate }) {
      return request<RevenueCatMetricsResponse>(
        'GET',
        `/v2/projects/${encodeURIComponent(projectId)}/metrics`,
        {
          query: {
            start_date: startDate,
            end_date: endDate,
          },
        },
      )
    },

    async getSubscriber(appUserId) {
      return request<RevenueCatSubscriberResponse>(
        'GET',
        `/v1/subscribers/${encodeURIComponent(appUserId)}`,
      )
    },
  }
}
