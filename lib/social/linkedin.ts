interface LinkedInCredentials {
  accessToken: string
  personUrn: string
}

function getLinkedInCredentials(): LinkedInCredentials {
  const accessToken = process.env.LINKEDIN_ACCESS_TOKEN
  const personUrn = process.env.LINKEDIN_PERSON_URN

  if (!accessToken) throw new Error('Missing env var: LINKEDIN_ACCESS_TOKEN')
  if (!personUrn) throw new Error('Missing env var: LINKEDIN_PERSON_URN')
  // Fix 8: Validate personUrn format
  if (!personUrn.startsWith('urn:li:')) throw new Error('LINKEDIN_PERSON_URN must start with urn:li: (e.g. urn:li:person:XXXXXXXX)')

  return { accessToken, personUrn }
}

const LINKEDIN_POSTS_URL = 'https://api.linkedin.com/rest/posts'

export async function postToLinkedIn(content: string): Promise<{ id: string }> {
  const { accessToken, personUrn } = getLinkedInCredentials()

  const body = JSON.stringify({
    author: personUrn,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: { text: content },
        shareMediaCategory: 'NONE',
      },
    },
    visibility: {
      'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
    },
  })

  const response = await fetch(LINKEDIN_POSTS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
      // Fix 7: LinkedIn API version — check LinkedIn changelog if requests start failing
      'LinkedIn-Version': '202502',
    },
    body,
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`LinkedIn API error ${response.status}: ${text}`)
  }

  // Fix 6: Post URN is returned in the x-restli-id response header, not the body
  const urn = response.headers.get('x-restli-id')
  if (!urn) throw new Error('LinkedIn API did not return a post URN')
  return { id: urn }
}
