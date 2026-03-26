# Social API — Claude-Accessible Contract

Base URL: `https://partnersinbiz.online/api/v1`

Auth: All endpoints require `Authorization: Bearer <AI_API_KEY>` header.

---

## Endpoints

### Schedule a Post

```
POST /api/v1/social/posts
```

**Body:**
```json
{
  "platform": "x" | "linkedin",
  "content": "Post text here",
  "scheduledFor": "2026-03-27T09:00:00.000Z",
  "threadParts": ["Part 1 text", "Part 2 text"],
  "category": "work" | "personal" | "ai" | "sport" | "sa" | "other",
  "tags": ["build-in-public", "week-1"]
}
```

- `threadParts` is optional (for X threads only; omit or set to `[]` for a single tweet)
- `category` defaults to `"other"` if omitted
- `tags` defaults to `[]` if omitted
- Status auto-set: future `scheduledFor` → `"scheduled"`, past → `"draft"`

**Response:**
```json
{ "success": true, "data": { "id": "<post-id>" } }
```

---

### List Posts

```
GET /api/v1/social/posts
GET /api/v1/social/posts?status=scheduled
GET /api/v1/social/posts?platform=x
GET /api/v1/social/posts?status=scheduled&from=2026-03-27T00:00:00Z&to=2026-04-03T00:00:00Z
```

**Query params (all optional):**
- `platform` — filter by `"x"` or `"linkedin"`
- `status` — filter by `"draft"` | `"scheduled"` | `"published"` | `"failed"` | `"cancelled"`
- `from` — ISO date, only posts with `scheduledFor >= from`
- `to` — ISO date, only posts with `scheduledFor <= to`

Returns array sorted ascending by `scheduledFor`.

---

### Get a Post

```
GET /api/v1/social/posts/:id
```

---

### Update a Post

```
PUT /api/v1/social/posts/:id
```

**Body** (all fields optional — partial update):
```json
{
  "content": "Updated text",
  "scheduledFor": "2026-03-28T09:00:00.000Z",
  "status": "draft",
  "category": "work",
  "tags": ["linkedin", "agency"],
  "threadParts": ["Updated part 1", "Updated part 2"]
}
```

---

### Cancel a Post (soft delete)

```
DELETE /api/v1/social/posts/:id
```

Sets `status: "cancelled"`. Does not delete the document.

---

### Publish Immediately

```
POST /api/v1/social/posts/:id/publish
```

Publishes the post right now, regardless of `scheduledFor`. Updates `status`, `publishedAt`, and `externalId` on success.

**Response:**
```json
{ "success": true, "data": { "id": "<post-id>", "externalId": "<tweet-id>", "platform": "x" } }
```

---

### Get X Reply Topics (scaffold)

```
GET /api/v1/social/x/reply-suggestions
```

Returns 8 engagement topics with scaffolded reply placeholders. Claude should call this to get the topic list, then research and draft actual replies per topic.

**Response:**
```json
[
  {
    "topic": "dev agencies",
    "searchQuery": "\"dev agency\" OR \"development agency\" -is:retweet lang:en",
    "draftReply": "[Claude: draft a reply to a post about dev agencies]",
    "context": "Engage with other agency owners and potential clients evaluating agencies"
  },
  ...
]
```

---

## Common Workflows

### Post LinkedIn content now
```bash
# 1. Create and immediately publish
POST /api/v1/social/posts
{ "platform": "linkedin", "content": "...", "scheduledFor": "2026-03-26T10:00:00Z", "category": "work" }

# Take the returned id and publish:
POST /api/v1/social/posts/<id>/publish
```

### Schedule a week of X posts
```bash
# Create each post with future scheduledFor
POST /api/v1/social/posts
{ "platform": "x", "content": "Monday post", "scheduledFor": "2026-03-30T14:00:00Z" }

POST /api/v1/social/posts
{ "platform": "x", "content": "Wednesday post", "scheduledFor": "2026-04-01T14:00:00Z" }
```

### Post an X thread
```bash
POST /api/v1/social/posts
{
  "platform": "x",
  "content": "Thread intro (used as fallback)",
  "threadParts": ["1/ First tweet", "2/ Second tweet", "3/ Third tweet"],
  "scheduledFor": "2026-03-28T09:00:00Z",
  "category": "work"
}
```

### List all upcoming scheduled posts
```bash
GET /api/v1/social/posts?status=scheduled
```

### Cancel a scheduled post
```bash
DELETE /api/v1/social/posts/<id>
```

### Get reply engagement topics
```bash
GET /api/v1/social/x/reply-suggestions
# Then for each topic, search X and draft a reply
```

---

## Environment Variables Required

### Twitter / X
| Variable | Description |
|----------|-------------|
| `X_API_KEY` | Twitter API key (OAuth 1.0a consumer key) |
| `X_API_KEY_SECRET` | Twitter API key secret |
| `X_ACCESS_TOKEN` | OAuth 1.0a access token |
| `X_ACCESS_TOKEN_SECRET` | OAuth 1.0a access token secret |

### LinkedIn
| Variable | Description |
|----------|-------------|
| `LINKEDIN_ACCESS_TOKEN` | OAuth 2.0 user token (expires every 60 days — refresh manually) |
| `LINKEDIN_PERSON_URN` | Your LinkedIn person URN, e.g. `urn:li:person:XXXXXXXX` |

---

## Cron Schedule

The cron endpoint `GET /api/cron/social` fires at 07:00 UTC (09:00 SAST) daily via Vercel's built-in cron.

For real-time scheduling (e.g. posts due at 14:00), configure an external cron trigger (cron-job.org or similar) to call `GET https://partnersinbiz.online/api/cron/social` hourly with `Authorization: Bearer <CRON_SECRET>`.

---

## Post Data Shape

```typescript
{
  id: string
  platform: 'x' | 'linkedin'
  content: string
  threadParts: string[]
  scheduledFor: Timestamp
  status: 'draft' | 'scheduled' | 'published' | 'failed' | 'cancelled'
  publishedAt: Timestamp | null
  externalId: string | null     // tweet ID or LinkedIn post URN
  error: string | null
  category: 'work' | 'personal' | 'ai' | 'sport' | 'sa' | 'other'
  tags: string[]
  createdBy: string
  createdAt: Timestamp
  updatedAt: Timestamp
}
```
