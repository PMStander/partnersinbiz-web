import { google } from 'googleapis'

const SCOPES = ['https://www.googleapis.com/auth/webmasters.readonly']

function client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    process.env.GSC_REDIRECT_URI,
  )
}

export function gscAuthUrl(state: string): string {
  return client().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    state,
  })
}

export async function exchangeGscCode(code: string) {
  const oauth = client()
  const { tokens } = await oauth.getToken(code)
  return tokens
}

export function refreshGscClient(refreshToken: string) {
  const oauth = client()
  oauth.setCredentials({ refresh_token: refreshToken })
  return oauth
}
