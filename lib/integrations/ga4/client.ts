// lib/integrations/ga4/client.ts
//
// Thin authenticated REST client for the Google Analytics Data API v1beta.
// Uses native fetch — no SDK. Handles:
//   - Bearer auth with the OAuth access token
//   - Lazy refresh when the token is within the expiry skew (or after a 401)
//   - JSON request/response with typed `runReport` helper
//
// All methods return parsed JSON or throw a `Ga4ApiError` with the HTTP
// status attached. Callers decide whether to swallow expected 4xx
// (auth / property not found / permission) and bubble up unexpected 5xx.

import { refreshAccessToken } from './oauth'
import type {
  Ga4ApiErrorBody,
  Ga4Credentials,
  Ga4RunReportRequest,
  Ga4RunReportResponse,
  GoogleTokenResponse,
} from './schema'

export const GA4_DATA_API_BASE = 'https://analyticsdata.googleapis.com/v1beta'

/** How early to refresh a token before its expiry (60s skew). */
const REFRESH_SKEW_MS = 60_000

export class Ga4ApiError extends Error {
  status: number
  body: string
  constructor(status: number, message: string, body = '') {
    super(message)
    this.name = 'Ga4ApiError'
    this.status = status
    this.body = body
  }
}

export interface Ga4Client {
  /** POST /v1beta/properties/{ga4PropertyId}:runReport */
  runReport: (input: {
    ga4PropertyId: string
    request: Ga4RunReportRequest
  }) => Promise<Ga4RunReportResponse>

  /** Returns the (possibly refreshed) credentials so callers can persist them. */
  getCredentials: () => Ga4Credentials

  /** Low-level escape hatch — exposed for adapters that need a raw call. */
  request: <T = unknown>(
    method: string,
    path: string,
    init?: { body?: unknown },
  ) => Promise<T>
}

export interface CreateClientInput {
  credentials: Ga4Credentials
  /** Required for refresh. If missing, refresh is disabled and 401s bubble up. */
  oauth?: { clientId: string; clientSecret: string }
  /** Override for tests. */
  baseUrl?: string
  /** Stable "now" for tests. */
  now?: () => number
  /** Override the refresh function for tests. */
  refresh?: (input: {
    refreshToken: string
    clientId: string
    clientSecret: string
  }) => Promise<GoogleTokenResponse | null>
}

export function createGa4Client(input: CreateClientInput): Ga4Client {
  const baseUrl = (input.baseUrl ?? GA4_DATA_API_BASE).replace(/\/$/, '')
  const now = input.now ?? (() => Date.now())
  const doRefresh = input.refresh ?? refreshAccessToken

  // Mutable so refresh updates take effect for subsequent calls.
  const creds: Ga4Credentials = { ...input.credentials }

  async function ensureFreshToken(): Promise<void> {
    if (!creds.refreshToken || !input.oauth) return
    if (creds.expiresAt - now() > REFRESH_SKEW_MS) return
    const refreshed = await doRefresh({
      refreshToken: creds.refreshToken,
      clientId: input.oauth.clientId,
      clientSecret: input.oauth.clientSecret,
    })
    if (!refreshed) {
      throw new Ga4ApiError(
        401,
        'GA4 refresh_token rejected — connection requires reauth.',
        '',
      )
    }
    creds.accessToken = refreshed.access_token
    creds.expiresAt = now() + (refreshed.expires_in ?? 0) * 1000
    if (refreshed.refresh_token) creds.refreshToken = refreshed.refresh_token
  }

  async function request<T>(
    method: string,
    path: string,
    init: { body?: unknown } = {},
  ): Promise<T> {
    await ensureFreshToken()

    const headers: Record<string, string> = {
      Authorization: `Bearer ${creds.accessToken}`,
      Accept: 'application/json',
    }
    if (init.body !== undefined) headers['Content-Type'] = 'application/json'

    let res = await fetch(baseUrl + path, {
      method,
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    })

    // 401 mid-request → try one refresh + retry.
    if (res.status === 401 && creds.refreshToken && input.oauth) {
      const refreshed = await doRefresh({
        refreshToken: creds.refreshToken,
        clientId: input.oauth.clientId,
        clientSecret: input.oauth.clientSecret,
      })
      if (refreshed) {
        creds.accessToken = refreshed.access_token
        creds.expiresAt = now() + (refreshed.expires_in ?? 0) * 1000
        if (refreshed.refresh_token) creds.refreshToken = refreshed.refresh_token
        headers.Authorization = `Bearer ${creds.accessToken}`
        res = await fetch(baseUrl + path, {
          method,
          headers,
          body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
        })
      }
    }

    const text = await res.text()
    if (!res.ok) {
      let message = `GA4 ${method} ${path} failed: ${res.status} ${res.statusText}`
      try {
        const body = JSON.parse(text) as Ga4ApiErrorBody
        if (body?.error?.message) message = `${message}: ${body.error.message}`
      } catch {
        // Non-JSON body — keep the default message.
      }
      throw new Ga4ApiError(res.status, message, text)
    }
    if (!text) return undefined as T
    try {
      return JSON.parse(text) as T
    } catch {
      throw new Ga4ApiError(
        res.status,
        `GA4 ${method} ${path} returned invalid JSON`,
        text,
      )
    }
  }

  return {
    request,
    getCredentials: () => ({ ...creds }),

    async runReport({ ga4PropertyId, request: reportRequest }) {
      // GA4 Data API expects a `properties/{numeric}:runReport` URL path.
      const id = ga4PropertyId.replace(/^properties\//, '')
      return request<Ga4RunReportResponse>(
        'POST',
        `/properties/${encodeURIComponent(id)}:runReport`,
        { body: reportRequest },
      )
    },
  }
}
