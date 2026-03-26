import crypto from 'crypto'

interface XCredentials {
  apiKey: string
  apiKeySecret: string
  accessToken: string
  accessTokenSecret: string
}

function getXCredentials(): XCredentials {
  const apiKey = process.env.X_API_KEY
  const apiKeySecret = process.env.X_API_KEY_SECRET
  const accessToken = process.env.X_ACCESS_TOKEN
  const accessTokenSecret = process.env.X_ACCESS_TOKEN_SECRET

  if (!apiKey) throw new Error('Missing env var: X_API_KEY')
  if (!apiKeySecret) throw new Error('Missing env var: X_API_KEY_SECRET')
  if (!accessToken) throw new Error('Missing env var: X_ACCESS_TOKEN')
  if (!accessTokenSecret) throw new Error('Missing env var: X_ACCESS_TOKEN_SECRET')

  return { apiKey, apiKeySecret, accessToken, accessTokenSecret }
}

// RFC 3986 percent-encoding
function percentEncode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
}

function buildOAuthHeader(
  method: string,
  url: string,
  credentials: XCredentials,
  extraQueryParams: Record<string, string> = {}
): string {
  // Fix 5: Strip query string from url and merge query params into signing params
  const urlObj = new URL(url)
  const baseUrl = `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`
  const urlQueryParams: Record<string, string> = {}
  urlObj.searchParams.forEach((value, key) => {
    urlQueryParams[key] = value
  })

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: credentials.apiKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: credentials.accessToken,
    oauth_version: '1.0',
  }

  // Collect all params to sign: oauth params + url query params + any extra query params (no body params for JSON POSTs)
  const allParams: Record<string, string> = { ...urlQueryParams, ...extraQueryParams, ...oauthParams }

  // Percent-encode and sort using code-point order (RFC 5849)
  const encodedPairs = Object.entries(allParams)
    .map(([k, v]) => [percentEncode(k), percentEncode(v)] as [string, string])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('&')

  // Build signature base string — use stripped base URL
  const baseString = [
    method.toUpperCase(),
    percentEncode(baseUrl),
    percentEncode(encodedPairs),
  ].join('&')

  // Signing key
  const signingKey = `${percentEncode(credentials.apiKeySecret)}&${percentEncode(credentials.accessTokenSecret)}`

  // Sign
  const signature = crypto.createHmac('sha1', signingKey).update(baseString).digest('base64')

  // Add signature to oauth params
  const signedOAuthParams: Record<string, string> = {
    ...oauthParams,
    oauth_signature: signature,
  }

  // Build Authorization header value — percent-encode values
  const headerParts = Object.entries(signedOAuthParams)
    .map(([k, v]) => `${k}="${percentEncode(v)}"`)
    .join(', ')

  return `OAuth ${headerParts}`
}

const TWEETS_URL = 'https://api.twitter.com/2/tweets'

export async function postTweet(content: string): Promise<{ id: string }> {
  const credentials = getXCredentials()
  const authHeader = buildOAuthHeader('POST', TWEETS_URL, credentials)

  const body = JSON.stringify({ text: content })

  const response = await fetch(TWEETS_URL, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
    body,
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Twitter API error ${response.status}: ${text}`)
  }

  const json = await response.json() as { data: { id: string; text: string } }
  // Fix 4: Guard against unexpected response shape
  if (!json?.data?.id) throw new Error('Twitter API returned unexpected response: ' + JSON.stringify(json))
  return { id: json.data.id }
}

export async function postThread(parts: string[]): Promise<{ ids: string[] }> {
  if (parts.length === 0) {
    throw new Error('postThread requires at least one part')
  }

  // Fix 2: Get credentials once and handle all HTTP calls directly — no internal postTweet call
  const credentials = getXCredentials()
  const ids: string[] = []

  for (let i = 0; i < parts.length; i++) {
    const authHeader = buildOAuthHeader('POST', TWEETS_URL, credentials)

    const bodyObj: { text: string; reply?: { in_reply_to_tweet_id: string } } = { text: parts[i] }
    if (i > 0) {
      bodyObj.reply = { in_reply_to_tweet_id: ids[i - 1] }
    }

    const response = await fetch(TWEETS_URL, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(bodyObj),
    })

    if (!response.ok) {
      const text = await response.text()
      // Fix 3: Include already-published IDs in partial failure error
      throw new Error(`Twitter API error ${response.status} on thread part ${i} (already published: ${ids.join(',')}): ${text}`)
    }

    const json = await response.json() as { data: { id: string; text: string } }
    // Fix 4: Guard against unexpected response shape
    if (!json?.data?.id) throw new Error('Twitter API returned unexpected response: ' + JSON.stringify(json))
    ids.push(json.data.id)
  }

  return { ids }
}
