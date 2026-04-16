import { createHmac } from 'node:crypto'

/**
 * Sign a webhook request body with HMAC-SHA256.
 *
 * Returns a signature of the form `sha256=<hex>` produced from the HMAC of
 * `${timestamp}.${body}` using `secret` as the key. Subscribers should verify
 * by recomputing the same HMAC and rejecting requests where:
 *
 *  - the signature does not match (tamper), or
 *  - the `X-PIB-Timestamp` header is more than ~5 minutes from server time
 *    (replay).
 *
 * Prepending the timestamp to the signed string is what prevents replay — an
 * attacker cannot resend a captured body with a new timestamp because the
 * signature would no longer verify.
 *
 * @param secret    HMAC signing secret (webhook.secret from Firestore).
 * @param body      The exact JSON string that will be sent as the request body.
 * @param timestamp Unix-ms timestamp that will also be sent as `X-PIB-Timestamp`.
 */
export function signPayload(secret: string, body: string, timestamp: number): string {
  const hex = createHmac('sha256', secret)
    .update(`${timestamp}.${body}`)
    .digest('hex')
  return `sha256=${hex}`
}
