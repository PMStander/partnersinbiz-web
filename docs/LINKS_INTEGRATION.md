# Link Shortening Integration Guide

Quick reference for integrating the link shortener into your workflows.

## Quick Start

### 1. Create a Short Link Programmatically

```typescript
import { createShortLink } from '@/lib/links/shorten'

const link = await createShortLink(
  orgId,
  'https://example.com/article?ref=newsletter',
  {
    utmSource: 'newsletter',
    utmMedium: 'email',
    utmCampaign: 'weekly_digest'
  },
  userId
)

console.log(link.shortUrl) // https://app.com/l/xYz9AbC
```

### 2. Use the API

```typescript
// List links
const response = await fetch('/api/v1/links?page=1&limit=20')
const { data, meta } = await response.json()

// Create link
const response = await fetch('/api/v1/links', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    originalUrl: 'https://example.com',
    utmSource: 'twitter',
    utmCampaign: 'launch'
  })
})

// Get link with stats
const response = await fetch('/api/v1/links/abc123')
const { data } = await response.json()
console.log(data.stats.totalClicks)

// Delete link
await fetch('/api/v1/links/abc123', { method: 'DELETE' })
```

### 3. Add to Social Posts

When creating a social post that includes a URL:

```typescript
import { createShortLink } from '@/lib/links/shorten'

// Before posting
const shortenedLink = await createShortLink(
  orgId,
  originalUrl,
  {
    utmSource: 'twitter',
    utmMedium: 'social',
    utmCampaign: postCampaign
  },
  userId
)

// Use in post content
const postContent = `Check this out: ${shortenedLink.shortUrl}`
```

## UI Components

### Link Creation Form

The link creation page is at:
```
/portal/social/links
```

Accessible from the social sidebar or directly navigated to.

### Embedding in Other Pages

To add link shortening to another page:

```typescript
'use client'

import { useState } from 'react'

export default function MyPage() {
  const [shortUrl, setShortUrl] = useState('')

  const handleShorten = async (originalUrl: string) => {
    const res = await fetch('/api/v1/links', {
      method: 'POST',
      body: JSON.stringify({ originalUrl })
    })
    const { data } = await res.json()
    setShortUrl(data.shortUrl)
  }

  return (
    <div>
      {/* Your component */}
      {shortUrl && <p>Short URL: {shortUrl}</p>}
    </div>
  )
}
```

## Common Patterns

### Pattern 1: Track Social Post Performance

```typescript
// When creating a social post
const shortenedLink = await createShortLink(orgId, url, {
  utmSource: platform, // 'twitter', 'linkedin'
  utmMedium: 'social',
  utmCampaign: campaignName,
  utmContent: postId // Track which specific post
})

// Store shortenedLink.id with post document
await db.collection('social_posts').doc(postId).update({
  trackedLinkId: shortenedLink.id
})

// Later: get post performance
const linkStats = await fetch(`/api/v1/links/${trackedLinkId}`)
```

### Pattern 2: Campaign Analytics

```typescript
// List all links for a campaign
const res = await fetch('/api/v1/links?page=1&limit=100')
const links = await res.json()

// Filter client-side
const campaignLinks = links.data.filter(
  l => l.utmCampaign === 'summer_promo'
)

// Aggregate clicks
const totalClicks = campaignLinks.reduce(
  (sum, l) => sum + l.clickCount, 0
)
```

### Pattern 3: Bulk Shorten

```typescript
async function shortenUrls(
  orgId: string,
  urls: string[],
  utm: Record<string, string>
) {
  return Promise.all(
    urls.map(url => 
      createShortLink(orgId, url, utm, userId)
    )
  )
}

const links = await shortenUrls(
  orgId,
  [
    'https://site.com/page1',
    'https://site.com/page2',
    'https://site.com/page3'
  ],
  {
    utmSource: 'email',
    utmCampaign: 'newsletter_vol5'
  }
)
```

## Environment Setup

Add to `.env.local`:

```bash
# URL used to build short links
NEXT_PUBLIC_APP_URL=https://app.partnersinbiz.com
```

For local development, this defaults to `http://localhost:3000`.

## Error Handling

```typescript
try {
  const link = await createShortLink(orgId, url, {}, userId)
} catch (error) {
  if (error.message.includes('Invalid URL')) {
    // Handle invalid URL
  } else if (error.message.includes('unique')) {
    // Rare: collision on short code (auto-retried 10x)
  } else {
    // Other error
  }
}
```

API errors return standard response:

```typescript
if (!response.ok) {
  const { error } = await response.json()
  // Handle: "originalUrl is required and must be a string"
  // Handle: "originalUrl must be a valid URL"
  // Handle: "Forbidden" (multi-tenant violation)
}
```

## Testing Shortcuts

### Create test links

```typescript
// In browser console or test
const testUrl = 'https://httpbin.org/get'
const res = await fetch('/api/v1/links', {
  method: 'POST',
  body: JSON.stringify({
    originalUrl: testUrl,
    utmSource: 'test',
    utmCampaign: 'qa'
  })
})
const { data } = await res.json()
console.log(data.shortUrl)
```

### Click a test link

Navigate to short URL in browser. In Firestore, check:
- `shortened_links/{linkId}/clicks` has new document
- `shortened_links/{linkId}.clickCount` incremented

### Check analytics

```bash
curl http://localhost:3000/api/v1/links/{linkId}/stats \
  -H "Authorization: Bearer <token>"
```

## Debugging

### Link not redirecting

1. Check short code exists in `/l/[code]` format
2. Verify Firestore document exists: `shortened_links.where('shortCode', '==', code)`
3. Check browser console for network errors
4. Server logs should show any redirect errors

### Click not tracked

1. Check `shortened_links/{linkId}/clicks` subcollection
2. Click logging is fire-and-forget — errors logged but not thrown
3. Look at server logs for any "Failed to track click" messages

### UTM params not appended

1. Verify params are set when creating link
2. Check `shortened_links/{linkId}` document has `utmSource`, etc.
3. URL preview should show in UI when creating

## Performance Notes

- Creating a link: ~200-300ms (includes Firestore write + uniqueness check)
- Resolving a link: ~50-100ms (single Firestore query + redirect)
- Click tracking: <10ms (fire-and-forget, non-blocking)
- Analytics: ~500ms-1s (fetches up to 1000 clicks, aggregates in-memory)

## Permissions

All write operations require `client` or `admin` role (enforced by `withAuth` middleware).

Public redirects at `/l/[code]` have no auth requirement.

## Next Steps

- [View Full Documentation](./LINKS_SYSTEM.md)
- [API Reference](./LINKS_SYSTEM.md#api-endpoints)
- [Firestore Schema](./LINKS_SYSTEM.md#firestore-schema)
