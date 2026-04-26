// lib/integrations/google_ads/client.ts
//
// Authenticated thin REST client for the Google Ads API v17. Uses native
// fetch — no SDK. Every request needs:
//   - `Authorization: Bearer <access_token>`         (per-customer OAuth2)
//   - `developer-token: <platform developer token>`  (Partners in Biz workspace)
//   - `login-customer-id: <manager id>`              (only when configured)
//
// The client does *not* persist anything. It just signs and shapes requests
// and parses streaming/non-streaming responses into a normalised array of
// chunks. Token refresh + connection updates happen in pull-daily.ts.

import {
  GOOGLE_ADS_API_BASE,
  readDeveloperToken,
  readLoginCustomerId,
} from './oauth'
import type {
  GoogleAdsApiErrorPayload,
  GoogleAdsRow,
  GoogleAdsRowCustomer,
  GoogleAdsSearchStreamChunk,
  GoogleAdsSearchStreamResponse,
} from './schema'

/* Errors ─────────────────────────────────────────────────────────────── */

export class GoogleAdsApiError extends Error {
  status: number
  body: string
  payload: GoogleAdsApiErrorPayload | null
  constructor(
    status: number,
    message: string,
    body = '',
    payload: GoogleAdsApiErrorPayload | null = null,
  ) {
    super(message)
    this.name = 'GoogleAdsApiError'
    this.status = status
    this.body = body
    this.payload = payload
  }
}

/* Client interface ───────────────────────────────────────────────────── */

export interface GoogleAdsClient {
  /**
   * POST /v17/customers/{customerId}/googleAds:searchStream — run a GAQL
   * query against the customer. Returns the parsed stream as an array of
   * chunks, with `results` flattened across chunks for convenience.
   */
  searchStream: (input: {
    customerId: string
    query: string
  }) => Promise<{
    chunks: GoogleAdsSearchStreamChunk[]
    rows: GoogleAdsRow[]
  }>

  /**
   * Convenience: run a tiny query against `FROM customer` to fetch the
   * customer's currency_code and time_zone. Used on first pull to lock the
   * connection's `meta.currencyCode` / `meta.timeZone`.
   */
  getCustomerSettings: (input: {
    customerId: string
  }) => Promise<GoogleAdsRowCustomer | null>

  /** Low-level escape hatch — exposed for tests / future endpoints. */
  request: <T = unknown>(
    method: string,
    path: string,
    init?: { body?: unknown },
  ) => Promise<T>
}

export interface CreateGoogleAdsClientInput {
  /** OAuth2 access token (already-refreshed). */
  accessToken: string
  /** Override for tests. */
  baseUrl?: string
  /** Override for tests — falls back to `GOOGLE_ADS_DEVELOPER_TOKEN`. */
  developerToken?: string
  /**
   * Optional manager-account id. Falls back to the value stored on the
   * connection's meta.loginCustomerId or env GOOGLE_ADS_LOGIN_CUSTOMER_ID.
   * Already dashes-stripped by the caller.
   */
  loginCustomerId?: string | null
}

export function createGoogleAdsClient(
  input: CreateGoogleAdsClientInput,
): GoogleAdsClient {
  const baseUrl = (input.baseUrl ?? GOOGLE_ADS_API_BASE).replace(/\/$/, '')
  const developerToken = (input.developerToken ?? readDeveloperToken() ?? '').trim()
  const loginCustomerId =
    (input.loginCustomerId ?? readLoginCustomerId() ?? '').trim() || null

  function buildHeaders(extra: Record<string, string> = {}): Record<string, string> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${input.accessToken}`,
      Accept: 'application/json',
      'developer-token': developerToken,
      ...extra,
    }
    if (loginCustomerId) headers['login-customer-id'] = loginCustomerId
    return headers
  }

  async function request<T>(
    method: string,
    path: string,
    init: { body?: unknown } = {},
  ): Promise<T> {
    const url = `${baseUrl}${path}`
    const body = init.body !== undefined ? JSON.stringify(init.body) : undefined
    const headers = buildHeaders(
      body !== undefined ? { 'Content-Type': 'application/json' } : {},
    )

    const res = await fetch(url, { method, headers, body })
    const text = await res.text()

    if (!res.ok) {
      let payload: GoogleAdsApiErrorPayload | null = null
      try {
        const parsed = JSON.parse(text) as { error?: GoogleAdsApiErrorPayload }
        payload = parsed?.error ?? null
      } catch {
        // ignore — non-JSON error
      }
      throw new GoogleAdsApiError(
        res.status,
        `Google Ads ${method} ${path} failed: ${res.status} ${res.statusText}`,
        text,
        payload,
      )
    }
    if (!text) return undefined as T
    try {
      return JSON.parse(text) as T
    } catch {
      throw new GoogleAdsApiError(
        res.status,
        `Google Ads ${method} ${path} returned invalid JSON`,
        text,
      )
    }
  }

  async function searchStream({
    customerId,
    query,
  }: {
    customerId: string
    query: string
  }): Promise<{
    chunks: GoogleAdsSearchStreamChunk[]
    rows: GoogleAdsRow[]
  }> {
    if (!customerId) {
      throw new GoogleAdsApiError(400, 'searchStream: customerId is required')
    }

    // searchStream returns a JSON array of chunks. We let `request` parse
    // the whole body as JSON — for the streaming endpoint, the wire format
    // is still a single JSON array; only very large responses split into
    // multiple chunks within that array.
    const parsed = await request<GoogleAdsSearchStreamResponse | GoogleAdsSearchStreamChunk>(
      'POST',
      `/customers/${encodeURIComponent(customerId)}/googleAds:searchStream`,
      { body: { query } },
    )

    const chunks: GoogleAdsSearchStreamChunk[] = Array.isArray(parsed)
      ? parsed
      : parsed
        ? [parsed]
        : []

    const rows: GoogleAdsRow[] = []
    for (const chunk of chunks) {
      if (chunk?.error) {
        throw new GoogleAdsApiError(
          chunk.error.code ?? 500,
          chunk.error.message ?? 'Google Ads searchStream returned an error chunk',
          JSON.stringify(chunk.error),
          chunk.error,
        )
      }
      if (Array.isArray(chunk?.results)) {
        rows.push(...chunk.results)
      }
    }

    return { chunks, rows }
  }

  async function getCustomerSettings({
    customerId,
  }: {
    customerId: string
  }): Promise<GoogleAdsRowCustomer | null> {
    if (!customerId) return null
    const query =
      'SELECT customer.id, customer.currency_code, customer.time_zone FROM customer LIMIT 1'
    const { rows } = await searchStream({ customerId, query })
    const customer = rows.find((r) => r.customer)?.customer
    return customer ?? null
  }

  return { request, searchStream, getCustomerSettings }
}
