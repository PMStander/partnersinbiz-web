// lib/integrations/play_console/client.ts
//
// Authenticated REST client for the Google Play Developer Reporting API
// (v1beta1). Uses native fetch — no SDK. Auth is a service-account JWT
// bearer token resolved via ./auth.ts; the client treats token acquisition
// as a delegated dependency so adapters can mock it cleanly.
//
// All methods return parsed JSON or throw a `PlayApiError` with the HTTP
// status attached. Callers decide whether to swallow expected 4xx
// (auth/permission) and bubble up unexpected 5xx.

import {
  PLAY_REPORTING_BASE_URL,
  type PlayMetricsQueryRequest,
  type PlayMetricsQueryResponse,
  type PlayServiceAccountKey,
} from './schema'
import { getAccessToken } from './auth'

export class PlayApiError extends Error {
  status: number
  body: string
  constructor(status: number, message: string, body = '') {
    super(message)
    this.name = 'PlayApiError'
    this.status = status
    this.body = body
  }
}

export interface PlayClient {
  /**
   * POST /v1beta1/apps/{packageName}/installsMetricSet:query — daily install,
   * uninstall, and active-device metrics for the package.
   */
  queryInstallsMetrics: (input: {
    packageName: string
    body: PlayMetricsQueryRequest
  }) => Promise<PlayMetricsQueryResponse>

  /**
   * POST /v1beta1/apps/{packageName}/financialMetricSet:query — daily IAP
   * and subscription revenue metrics for the package. May 404 if the SA
   * lacks Financial Data permission.
   */
  queryFinancialMetrics: (input: {
    packageName: string
    body: PlayMetricsQueryRequest
  }) => Promise<PlayMetricsQueryResponse>

  /**
   * POST /v1beta1/apps/{packageName}/ratingsMetricSet:query — daily rating
   * metrics. Optional; we soft-fail when not available.
   */
  queryRatingsMetrics: (input: {
    packageName: string
    body: PlayMetricsQueryRequest
  }) => Promise<PlayMetricsQueryResponse>

  /** Low-level escape hatch — exposed for adapters that need a raw call. */
  request: <T = unknown>(
    method: string,
    path: string,
    init?: { query?: Record<string, string | undefined>; body?: unknown },
  ) => Promise<T>
}

export interface CreatePlayClientInput {
  /** Parsed service-account key. */
  key: PlayServiceAccountKey
  /**
   * Cache key for the access-token cache — typically connection.id so each
   * connection has its own slot. Multiple cache slots backed by the same SA
   * are fine; the JWT is signed per acquisition.
   */
  cacheKey: string
  /** Override base URL — for tests. */
  baseUrl?: string
  /** Override fetch — for tests. */
  fetcher?: typeof fetch
  /** Override token resolver — for tests. */
  tokenResolver?: () => Promise<string>
}

export function createPlayClient(input: CreatePlayClientInput): PlayClient {
  const baseUrl = (input.baseUrl ?? PLAY_REPORTING_BASE_URL).replace(/\/$/, '')
  const fetcher = input.fetcher ?? fetch
  const resolveToken =
    input.tokenResolver ??
    (() =>
      getAccessToken({
        key: input.key,
        cacheKey: input.cacheKey,
        fetcher,
      }))

  async function request<T>(
    method: string,
    path: string,
    init: { query?: Record<string, string | undefined>; body?: unknown } = {},
  ): Promise<T> {
    const token = await resolveToken()
    const url = new URL(baseUrl + path)
    if (init.query) {
      for (const [k, v] of Object.entries(init.query)) {
        if (v != null && v !== '') url.searchParams.set(k, v)
      }
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    }
    if (init.body !== undefined) headers['Content-Type'] = 'application/json'

    const res = await fetcher(url.toString(), {
      method,
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    })

    const text = await res.text()
    if (!res.ok) {
      throw new PlayApiError(
        res.status,
        `Play Reporting ${method} ${path} failed: ${res.status} ${res.statusText}`,
        text,
      )
    }
    if (!text) return undefined as T
    try {
      return JSON.parse(text) as T
    } catch {
      throw new PlayApiError(
        res.status,
        `Play Reporting ${method} ${path} returned invalid JSON`,
        text,
      )
    }
  }

  return {
    request,

    async queryInstallsMetrics({ packageName, body }) {
      return request<PlayMetricsQueryResponse>(
        'POST',
        `/v1beta1/apps/${encodeURIComponent(packageName)}/installsMetricSet:query`,
        { body },
      )
    },

    async queryFinancialMetrics({ packageName, body }) {
      return request<PlayMetricsQueryResponse>(
        'POST',
        `/v1beta1/apps/${encodeURIComponent(packageName)}/financialMetricSet:query`,
        { body },
      )
    },

    async queryRatingsMetrics({ packageName, body }) {
      return request<PlayMetricsQueryResponse>(
        'POST',
        `/v1beta1/apps/${encodeURIComponent(packageName)}/ratingsMetricSet:query`,
        { body },
      )
    },
  }
}
