# Social Media with Media + X Threads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add media upload infrastructure (Firebase Storage) and wire media through the publish flow so X/Twitter, LinkedIn, and Threads can send images/videos with posts; also ensure X threads work end-to-end.

**Architecture:** A single upload endpoint stores media binaries in Firebase Storage and records them in `social_media`. At publish time, the queue + publish route extract `post.media[].url` and pass them as `mediaUrls` to providers. Twitter and LinkedIn pre-upload the binary to their own media APIs before posting; Threads accepts our public Firebase Storage URLs directly (no pre-upload needed).

**Tech Stack:** Next.js App Router, Firebase Admin SDK (Firestore + Storage), TypeScript, Jest + ts-jest, Twitter v1.1 media upload API, LinkedIn REST API (images + videos), Threads Graph API.

---

## File Map

**Create:**
- `lib/social/storage.ts` — Firebase Storage upload/delete helpers
- `app/api/v1/social/media/upload/route.ts` — `POST /api/v1/social/media/upload` multipart endpoint
- `__tests__/lib/social/storage.test.ts`
- `__tests__/lib/social/providers/twitter-media.test.ts`
- `__tests__/lib/social/providers/linkedin-media.test.ts`

**Modify:**
- `lib/social/providers/types.ts` — add `storagePath` to `SocialMedia`
- `lib/social/providers/base.ts` — update `publishThread(parts, mediaUrls?)` signature
- `lib/social/providers/twitter.ts` — add `buildOAuthHeader` bodyParams support, `uploadImageFromUrl`, `uploadVideoFromUrl`, `pollMediaStatus`, `guessMimeType`; wire `mediaUrls` in `publishPost`
- `lib/social/providers/linkedin.ts` — add `uploadImageFromUrl`, `uploadVideoFromUrl`, `guessMimeType`; wire `mediaUrls` in `publishPost`
- `lib/social/providers/threads.ts` — update `publishThread` to pass `mediaUrls` to first part
- `lib/social/queue.ts` — pass `mediaUrls` through `doPublish` + `publishWithRefresh`
- `app/api/v1/social/posts/[id]/publish/route.ts` — extract + pass `mediaUrls` to providers

---

## Task 1: Firebase Storage upload library

**Files:**
- Create: `lib/social/storage.ts`
- Test: `__tests__/lib/social/storage.test.ts`

- [ ] **Step 1.1: Write failing test**

```typescript
// __tests__/lib/social/storage.test.ts
jest.mock('firebase-admin/storage', () => ({
  getStorage: jest.fn().mockReturnValue({
    bucket: jest.fn().mockReturnValue({
      name: 'test-bucket',
      file: jest.fn().mockReturnValue({
        save: jest.fn().mockResolvedValue(undefined),
        delete: jest.fn().mockResolvedValue(undefined),
        makePublic: jest.fn().mockResolvedValue(undefined),
      }),
    }),
  }),
}))
jest.mock('@/lib/firebase/admin', () => ({ getAdminApp: jest.fn().mockReturnValue({}) }))

import { uploadMediaToStorage, deleteMediaFromStorage } from '@/lib/social/storage'

describe('uploadMediaToStorage', () => {
  it('returns public URL and storagePath', async () => {
    const buffer = Buffer.from('fake-image-data')
    const result = await uploadMediaToStorage(buffer, 'image/jpeg', 'org-123', 'photo.jpg')
    expect(result.publicUrl).toMatch(/^https:\/\/storage\.googleapis\.com\/test-bucket\/social-media\/org-123\//)
    expect(result.storagePath).toMatch(/^social-media\/org-123\//)
    expect(result.storagePath).toMatch(/\.jpg$/)
  })
})

describe('deleteMediaFromStorage', () => {
  it('calls delete on the file', async () => {
    await expect(deleteMediaFromStorage('social-media/org-123/abc.jpg')).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 1.2: Run test to verify it fails**

```bash
cd "partnersinbiz-web" && npx jest __tests__/lib/social/storage.test.ts --no-coverage 2>&1 | tail -20
```
Expected: FAIL — Cannot find module `@/lib/social/storage`

- [ ] **Step 1.3: Create `lib/social/storage.ts`**

```typescript
import { getStorage } from 'firebase-admin/storage'
import { getAdminApp } from '@/lib/firebase/admin'
import crypto from 'crypto'

export async function uploadMediaToStorage(
  buffer: Buffer,
  mimeType: string,
  orgId: string,
  originalFilename: string,
): Promise<{ publicUrl: string; storagePath: string }> {
  const ext = (originalFilename.split('.').pop() ?? 'bin').toLowerCase().split('?')[0]
  const id = crypto.randomBytes(12).toString('hex')
  const storagePath = `social-media/${orgId}/${id}.${ext}`

  const bucket = getStorage(getAdminApp()).bucket()
  const file = bucket.file(storagePath)
  await file.save(buffer, { metadata: { contentType: mimeType } })
  await file.makePublic()

  const publicUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`
  return { publicUrl, storagePath }
}

export async function deleteMediaFromStorage(storagePath: string): Promise<void> {
  const bucket = getStorage(getAdminApp()).bucket()
  await bucket.file(storagePath).delete({ ignoreNotFound: true } as Parameters<ReturnType<typeof bucket.file>['delete']>[0])
}
```

- [ ] **Step 1.4: Run test to verify it passes**

```bash
npx jest __tests__/lib/social/storage.test.ts --no-coverage 2>&1 | tail -10
```
Expected: PASS

- [ ] **Step 1.5: Commit**

```bash
git add lib/social/storage.ts __tests__/lib/social/storage.test.ts
git commit -m "feat: add Firebase Storage upload helper for social media"
```

---

## Task 2: Media upload endpoint

**Files:**
- Create: `app/api/v1/social/media/upload/route.ts`
- Modify: `lib/social/providers/types.ts` (add `storagePath` to `SocialMedia`)

- [ ] **Step 2.1: Add `storagePath` to `SocialMedia` type**

In `lib/social/providers/types.ts`, add `storagePath` after `altText`:

Old:
```typescript
  altText: string
  usedInPosts: string[]
```
New:
```typescript
  altText: string
  storagePath: string | null
  usedInPosts: string[]
```

- [ ] **Step 2.2: Create the upload route**

```typescript
// app/api/v1/social/media/upload/route.ts
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { withTenant } from '@/lib/api/tenant'
import { apiSuccess, apiError } from '@/lib/api/response'
import { uploadMediaToStorage } from '@/lib/social/storage'
import type { MediaType, MediaStatus } from '@/lib/social/providers'

export const dynamic = 'force-dynamic'

const MAX_SIZE_BYTES = 512 * 1024 * 1024
const ALLOWED_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'video/mp4', 'video/quicktime',
]

export const POST = withAuth('admin', withTenant(async (req, user, orgId) => {
  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return apiError('Request must be multipart/form-data')
  }

  const file = formData.get('file') as File | null
  if (!file) return apiError('file field is required')
  if (!ALLOWED_TYPES.includes(file.type)) {
    return apiError(`Unsupported file type: ${file.type}. Allowed: ${ALLOWED_TYPES.join(', ')}`)
  }
  if (file.size > MAX_SIZE_BYTES) {
    return apiError(`File exceeds 512MB limit (${(file.size / 1024 / 1024).toFixed(1)}MB)`)
  }

  const altText = (formData.get('altText') as string | null) ?? ''
  const buffer = Buffer.from(await file.arrayBuffer())

  const type: MediaType = file.type.startsWith('video/')
    ? 'video'
    : file.type === 'image/gif'
    ? 'gif'
    : 'image'

  const { publicUrl, storagePath } = await uploadMediaToStorage(buffer, file.type, orgId, file.name)

  const doc = {
    orgId,
    originalUrl: publicUrl,
    originalFilename: file.name,
    originalMimeType: file.type,
    originalSize: file.size,
    status: 'ready' as MediaStatus,
    variants: {},
    thumbnailUrl: publicUrl,
    type,
    width: 0,
    height: 0,
    duration: null,
    altText,
    storagePath,
    usedInPosts: [],
    uploadedBy: user.uid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }

  const docRef = await adminDb.collection('social_media').add(doc)

  return apiSuccess({ id: docRef.id, url: publicUrl, type, mimeType: file.type }, 201)
}))
```

- [ ] **Step 2.3: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | grep -E "upload/route|storage" | head -10
```
Expected: no errors on these files

- [ ] **Step 2.4: Commit**

```bash
git add app/api/v1/social/media/upload/route.ts lib/social/providers/types.ts
git commit -m "feat: add POST /api/v1/social/media/upload endpoint (Firebase Storage)"
```

---

## Task 3: Wire media through publish flow

**Files:**
- Modify: `lib/social/providers/base.ts`
- Modify: `lib/social/queue.ts`
- Modify: `app/api/v1/social/posts/[id]/publish/route.ts`

- [ ] **Step 3.1: Update `publishThread` signature in `base.ts`**

In `lib/social/providers/base.ts`, replace:
```typescript
  async publishThread(parts: string[]): Promise<PublishResult[]> {
    // Default: publish each part as a separate post. Thread-capable platforms override this.
    const results: PublishResult[] = []
    for (const part of parts) {
      const result = await this.publishPost({ text: part, replyToId: results[results.length - 1]?.platformPostId })
      results.push(result)
    }
    return results
  }
```
With:
```typescript
  /** Publish a thread (multi-part post). Media applies to first part only. */
  async publishThread(parts: string[], mediaUrls?: string[]): Promise<PublishResult[]> {
    const results: PublishResult[] = []
    for (let i = 0; i < parts.length; i++) {
      const result = await this.publishPost({
        text: parts[i],
        replyToId: results[results.length - 1]?.platformPostId,
        mediaUrls: i === 0 ? mediaUrls : undefined,
      })
      results.push(result)
    }
    return results
  }
```

- [ ] **Step 3.2: Update `doPublish` and `publishWithRefresh` in `queue.ts`**

Replace the `doPublish` function:
```typescript
async function doPublish(
  provider: ReturnType<typeof import('@/lib/social/providers').getProvider>,
  text: string,
  threadParts: string[] | undefined,
  mediaUrls: string[] | undefined,
): Promise<string> {
  if (Array.isArray(threadParts) && threadParts.length > 0) {
    const results = await provider.publishThread(threadParts, mediaUrls)
    return results[0].platformPostId
  }
  const result = await provider.publishPost({ text, mediaUrls })
  return result.platformPostId
}
```

Replace `publishWithRefresh` signature and body:
```typescript
async function publishWithRefresh(
  provider: ReturnType<typeof import('@/lib/social/providers').getProvider>,
  text: string,
  threadParts: string[] | undefined,
  mediaUrls: string[] | undefined,
  accountId: string | null,
  orgId: string,
  platformType: SocialPlatformType,
): Promise<string> {
  try {
    return await doPublish(provider, text, threadParts, mediaUrls)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    if (msg.includes('401') && accountId) {
      console.log(`[queue] 401 hit, refreshing token for ${accountId}`)
      const refreshed = await refreshAccountToken(accountId, orgId, platformType)
      if (refreshed) {
        console.log(`[queue] Token refreshed, retrying ${accountId}`)
        return await doPublish(refreshed, text, threadParts, mediaUrls)
      }
    }
    throw err
  }
}
```

In `processQueue()`, extract `mediaUrls` from post and pass to `publishWithRefresh`. Replace:
```typescript
      const externalId = await publishWithRefresh(provider, text, post.threadParts, accountId, orgId, platformType)
```
With:
```typescript
      const mediaUrls: string[] | undefined = Array.isArray(post.media) && post.media.length > 0
        ? (post.media as Array<{ url: string }>).map(m => m.url).filter(Boolean)
        : undefined
      const externalId = await publishWithRefresh(provider, text, post.threadParts, mediaUrls, accountId, orgId, platformType)
```

- [ ] **Step 3.3: Update `publish/route.ts` to pass `mediaUrls`**

In `app/api/v1/social/posts/[id]/publish/route.ts`, add media extraction after `const text = ...`:

```typescript
  const mediaUrls: string[] | undefined = Array.isArray(post.media) && post.media.length > 0
    ? (post.media as Array<{ url: string }>).map((m) => m.url).filter(Boolean)
    : undefined
```

Replace all four `provider.publishThread(threadParts)` and `provider.publishPost({ text })` calls:

```typescript
      if (Array.isArray(threadParts) && threadParts.length > 0) {
        const results = await provider.publishThread(threadParts, mediaUrls)
        externalId = results[0].platformPostId
      } else {
        const result = await provider.publishPost({ text, mediaUrls })
        externalId = result.platformPostId
      }
```
(Apply the same replacement for both the initial attempt block and the refresh retry block.)

- [ ] **Step 3.4: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | grep -v "node_modules" | head -20
```
Expected: no new errors

- [ ] **Step 3.5: Commit**

```bash
git add lib/social/providers/base.ts lib/social/queue.ts app/api/v1/social/posts/[id]/publish/route.ts
git commit -m "feat: wire post.media[].url through queue and publish route to providers"
```

---

## Task 4: Twitter media upload

**Files:**
- Modify: `lib/social/providers/twitter.ts`
- Test: `__tests__/lib/social/providers/twitter-media.test.ts`

- [ ] **Step 4.1: Write failing tests**

```typescript
// __tests__/lib/social/providers/twitter-media.test.ts
const mockFetch = jest.fn()
global.fetch = mockFetch

import { TwitterProvider } from '@/lib/social/providers/twitter'

const creds = {
  apiKey: 'key',
  apiKeySecret: 'secret',
  accessToken: 'token',
  accessTokenSecret: 'tokenSecret',
}

function makeProvider() {
  return new TwitterProvider(creds)
}

describe('TwitterProvider.guessMimeType', () => {
  const p = makeProvider()
  it('detects mp4', () => expect((p as unknown as { guessMimeType: (u: string) => string }).guessMimeType('https://cdn.example.com/video.mp4')).toBe('video/mp4'))
  it('detects png', () => expect((p as unknown as { guessMimeType: (u: string) => string }).guessMimeType('https://cdn.example.com/image.png')).toBe('image/png'))
  it('defaults to jpeg', () => expect((p as unknown as { guessMimeType: (u: string) => string }).guessMimeType('https://cdn.example.com/photo')).toBe('image/jpeg'))
})

describe('TwitterProvider.publishPost with mediaUrls', () => {
  it('uploads image and attaches media_ids to tweet', async () => {
    const imageBuffer = Buffer.from('fake-image')
    // Download response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => imageBuffer.buffer,
      headers: { get: () => 'image/jpeg' },
    })
    // Media upload response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ media_id_string: '99999' }),
    })
    // Tweet post response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { id: 'tweet-123' } }),
    })

    const p = makeProvider()
    const result = await p.publishPost({ text: 'Hello with image', mediaUrls: ['https://storage.googleapis.com/bucket/photo.jpg'] })

    expect(result.platformPostId).toBe('tweet-123')
    // Verify tweet body included media_ids
    const tweetCall = mockFetch.mock.calls[2]
    const tweetBody = JSON.parse(tweetCall[1].body)
    expect(tweetBody.media).toEqual({ media_ids: ['99999'] })
  })

  it('publishes thread with media on first tweet only', async () => {
    // Three fetch pairs: download + upload for media (first tweet), then 3 tweet posts
    const imageBuffer = Buffer.from('img')
    mockFetch
      .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => imageBuffer.buffer, headers: { get: () => 'image/jpeg' } }) // download
      .mockResolvedValueOnce({ ok: true, json: async () => ({ media_id_string: '111' }) }) // upload
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { id: 't1' } }) }) // tweet 1
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { id: 't2' } }) }) // tweet 2
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { id: 't3' } }) }) // tweet 3

    const p = makeProvider()
    const results = await p.publishThread(['Part 1', 'Part 2', 'Part 3'], ['https://cdn.example.com/img.jpg'])
    expect(results).toHaveLength(3)
    expect(results[0].platformPostId).toBe('t1')

    // Tweet 1 body has media
    const tweet1Body = JSON.parse(mockFetch.mock.calls[2][1].body)
    expect(tweet1Body.media).toEqual({ media_ids: ['111'] })
    // Tweet 2 body has no media
    const tweet2Body = JSON.parse(mockFetch.mock.calls[3][1].body)
    expect(tweet2Body.media).toBeUndefined()
  })
})
```

- [ ] **Step 4.2: Run test to verify it fails**

```bash
npx jest __tests__/lib/social/providers/twitter-media.test.ts --no-coverage 2>&1 | tail -20
```
Expected: FAIL — methods don't exist yet

- [ ] **Step 4.3: Update `buildOAuthHeader` to accept `bodyParams`**

In `lib/social/providers/twitter.ts`, replace the `buildOAuthHeader` function signature and `allParams` line:

Old:
```typescript
function buildOAuthHeader(
  method: string,
  url: string,
  apiKey: string,
  apiKeySecret: string,
  accessToken: string,
  accessTokenSecret: string,
): string {
```
New:
```typescript
function buildOAuthHeader(
  method: string,
  url: string,
  apiKey: string,
  apiKeySecret: string,
  accessToken: string,
  accessTokenSecret: string,
  bodyParams?: Record<string, string>,
): string {
```

Old:
```typescript
  const allParams: Record<string, string> = { ...urlQueryParams, ...oauthParams }
```
New:
```typescript
  const allParams: Record<string, string> = { ...urlQueryParams, ...oauthParams, ...(bodyParams ?? {}) }
```

- [ ] **Step 4.4: Update `getAuthHeader` to forward `bodyParams`**

Old:
```typescript
  private getAuthHeader(method: string, url: string): string {
    if (this.useOAuth2) {
      return `Bearer ${this.credentials.accessToken}`
    }
    return buildOAuthHeader(
      method,
      url,
      this.credentials.apiKey!,
      this.credentials.apiKeySecret!,
      this.credentials.accessToken,
      this.credentials.accessTokenSecret!,
    )
  }
```
New:
```typescript
  private getAuthHeader(method: string, url: string, bodyParams?: Record<string, string>): string {
    if (this.useOAuth2) {
      return `Bearer ${this.credentials.accessToken}`
    }
    return buildOAuthHeader(
      method,
      url,
      this.credentials.apiKey!,
      this.credentials.apiKeySecret!,
      this.credentials.accessToken,
      this.credentials.accessTokenSecret!,
      bodyParams,
    )
  }
```

- [ ] **Step 4.5: Add `guessMimeType`, `uploadImageFromUrl`, `uploadVideoFromUrl`, `pollMediaStatus` methods to `TwitterProvider`**

Add these methods inside the `TwitterProvider` class, before `publishPost`:

```typescript
  private guessMimeType(url: string): string {
    const lower = url.toLowerCase().split('?')[0]
    if (lower.endsWith('.mp4')) return 'video/mp4'
    if (lower.endsWith('.mov')) return 'video/quicktime'
    if (lower.endsWith('.gif')) return 'image/gif'
    if (lower.endsWith('.png')) return 'image/png'
    if (lower.endsWith('.webp')) return 'image/webp'
    return 'image/jpeg'
  }

  private async uploadImageFromUrl(imageUrl: string, mimeType: string): Promise<string> {
    const UPLOAD_URL = 'https://upload.twitter.com/1.1/media/upload.json'
    const res = await fetch(imageUrl)
    if (!res.ok) throw new Error(`Failed to download image: ${res.status}`)
    const buffer = Buffer.from(await res.arrayBuffer())

    const form = new FormData()
    form.append('media', new Blob([buffer], { type: mimeType }), 'media')

    const uploadRes = await fetch(UPLOAD_URL, {
      method: 'POST',
      headers: { Authorization: this.getAuthHeader('POST', UPLOAD_URL) },
      body: form,
    })
    if (!uploadRes.ok) throw new Error(`Twitter media upload error ${uploadRes.status}: ${await uploadRes.text()}`)
    const json = await uploadRes.json() as { media_id_string: string }
    return json.media_id_string
  }

  private async uploadVideoFromUrl(videoUrl: string, mimeType: string): Promise<string> {
    const UPLOAD_URL = 'https://upload.twitter.com/1.1/media/upload.json'
    const res = await fetch(videoUrl)
    if (!res.ok) throw new Error(`Failed to download video: ${res.status}`)
    const buffer = Buffer.from(await res.arrayBuffer())

    // INIT
    const initParams: Record<string, string> = {
      command: 'INIT',
      media_type: mimeType,
      total_bytes: buffer.length.toString(),
      media_category: 'tweet_video',
    }
    const initRes = await fetch(UPLOAD_URL, {
      method: 'POST',
      headers: {
        Authorization: this.getAuthHeader('POST', UPLOAD_URL, initParams),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(initParams).toString(),
    })
    if (!initRes.ok) throw new Error(`Twitter video INIT error ${initRes.status}: ${await initRes.text()}`)
    const initJson = await initRes.json() as { media_id_string: string }
    const mediaId = initJson.media_id_string

    // APPEND (single chunk)
    const appendForm = new FormData()
    appendForm.append('command', 'APPEND')
    appendForm.append('media_id', mediaId)
    appendForm.append('segment_index', '0')
    appendForm.append('media', new Blob([buffer], { type: mimeType }), 'media')
    const appendRes = await fetch(UPLOAD_URL, {
      method: 'POST',
      headers: { Authorization: this.getAuthHeader('POST', UPLOAD_URL) },
      body: appendForm,
    })
    if (!appendRes.ok && appendRes.status !== 204) {
      throw new Error(`Twitter video APPEND error ${appendRes.status}: ${await appendRes.text()}`)
    }

    // FINALIZE
    const finalizeParams: Record<string, string> = { command: 'FINALIZE', media_id: mediaId }
    const finalizeRes = await fetch(UPLOAD_URL, {
      method: 'POST',
      headers: {
        Authorization: this.getAuthHeader('POST', UPLOAD_URL, finalizeParams),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(finalizeParams).toString(),
    })
    if (!finalizeRes.ok) throw new Error(`Twitter video FINALIZE error ${finalizeRes.status}: ${await finalizeRes.text()}`)
    const finalizeJson = await finalizeRes.json() as {
      media_id_string: string
      processing_info?: { state: string; check_after_secs?: number }
    }

    if (finalizeJson.processing_info?.state === 'pending' || finalizeJson.processing_info?.state === 'in_progress') {
      await this.pollMediaStatus(mediaId, finalizeJson.processing_info.check_after_secs ?? 5)
    }

    return mediaId
  }

  private async pollMediaStatus(mediaId: string, waitSecs: number): Promise<void> {
    await new Promise(r => setTimeout(r, waitSecs * 1000))
    const STATUS_URL = `https://upload.twitter.com/1.1/media/upload.json?command=STATUS&media_id=${mediaId}`
    const res = await fetch(STATUS_URL, { headers: { Authorization: this.getAuthHeader('GET', STATUS_URL) } })
    if (!res.ok) return
    const json = await res.json() as { processing_info?: { state: string; check_after_secs?: number } }
    const state = json.processing_info?.state
    if (state === 'failed') throw new Error(`Twitter video processing failed for media_id: ${mediaId}`)
    if (state === 'pending' || state === 'in_progress') {
      await this.pollMediaStatus(mediaId, json.processing_info?.check_after_secs ?? 5)
    }
  }
```

- [ ] **Step 4.6: Update `publishPost` to upload media and attach `media_ids`**

In `TwitterProvider.publishPost`, replace the current implementation:

Old:
```typescript
  async publishPost(options: PublishOptions): Promise<PublishResult> {
    // If thread parts provided, publish as thread and return first ID
    if (options.threadParts && options.threadParts.length > 0) {
      const results = await this.publishThread(options.threadParts)
      return results[0]
    }

    const authHeader = this.getAuthHeader('POST', TWEETS_URL)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bodyObj: any = { text: options.text }
    if (options.replyToId) {
      bodyObj.reply = { in_reply_to_tweet_id: options.replyToId }
    }
```
New:
```typescript
  async publishPost(options: PublishOptions): Promise<PublishResult> {
    if (options.threadParts && options.threadParts.length > 0) {
      const results = await this.publishThread(options.threadParts, options.mediaUrls)
      return results[0]
    }

    // Upload media to Twitter and collect media_ids
    const mediaIds: string[] = []
    if (options.mediaUrls && options.mediaUrls.length > 0) {
      for (const url of options.mediaUrls.slice(0, 4)) {
        const mimeType = this.guessMimeType(url)
        const mediaId = mimeType.startsWith('video/')
          ? await this.uploadVideoFromUrl(url, mimeType)
          : await this.uploadImageFromUrl(url, mimeType)
        mediaIds.push(mediaId)
      }
    }

    const authHeader = this.getAuthHeader('POST', TWEETS_URL)
    const bodyObj: Record<string, unknown> = { text: options.text }
    if (options.replyToId) {
      bodyObj.reply = { in_reply_to_tweet_id: options.replyToId }
    }
    if (mediaIds.length > 0) {
      bodyObj.media = { media_ids: mediaIds }
    }
```

- [ ] **Step 4.7: Update `publishThread` override to pass `mediaUrls`**

Old:
```typescript
  async publishThread(parts: string[]): Promise<PublishResult[]> {
    if (parts.length === 0) throw new Error('publishThread requires at least one part')

    const results: PublishResult[] = []

    for (let i = 0; i < parts.length; i++) {
      const result = await this.publishPost({
        text: parts[i],
        replyToId: results[results.length - 1]?.platformPostId,
      })
      results.push(result)
    }

    return results
  }
```
New:
```typescript
  async publishThread(parts: string[], mediaUrls?: string[]): Promise<PublishResult[]> {
    if (parts.length === 0) throw new Error('publishThread requires at least one part')
    const results: PublishResult[] = []
    for (let i = 0; i < parts.length; i++) {
      const result = await this.publishPost({
        text: parts[i],
        replyToId: results[results.length - 1]?.platformPostId,
        mediaUrls: i === 0 ? mediaUrls : undefined,
      })
      results.push(result)
    }
    return results
  }
```

- [ ] **Step 4.8: Run tests**

```bash
npx jest __tests__/lib/social/providers/twitter-media.test.ts --no-coverage 2>&1 | tail -20
```
Expected: PASS

- [ ] **Step 4.9: Commit**

```bash
git add lib/social/providers/twitter.ts __tests__/lib/social/providers/twitter-media.test.ts
git commit -m "feat: Twitter media upload (images + chunked video) + thread media on first tweet"
```

---

## Task 5: LinkedIn media upload

**Files:**
- Modify: `lib/social/providers/linkedin.ts`
- Test: `__tests__/lib/social/providers/linkedin-media.test.ts`

- [ ] **Step 5.1: Write failing tests**

```typescript
// __tests__/lib/social/providers/linkedin-media.test.ts
const mockFetch = jest.fn()
global.fetch = mockFetch

import { LinkedInProvider } from '@/lib/social/providers/linkedin'

const creds = { accessToken: 'test-token', personUrn: 'urn:li:person:abc123' }

function makeProvider() {
  return new LinkedInProvider(creds)
}

describe('LinkedInProvider.publishPost with image', () => {
  it('uploads image and includes content.media in post body', async () => {
    const imageBuffer = Buffer.from('fake-image')

    // Download image
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => imageBuffer.buffer,
      headers: { get: (h: string) => h === 'content-type' ? 'image/jpeg' : null },
    })
    // initializeUpload
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ value: { uploadUrl: 'https://upload.linkedin.com/xxx', image: 'urn:li:image:12345' } }),
    })
    // PUT binary
    mockFetch.mockResolvedValueOnce({ ok: true, text: async () => '' })
    // POST /rest/posts
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => '',
      headers: { get: (h: string) => h === 'x-restli-id' ? 'urn:li:share:999' : null },
    })

    const p = makeProvider()
    const result = await p.publishPost({
      text: 'Check this out',
      mediaUrls: ['https://storage.googleapis.com/bucket/photo.jpg'],
    })

    expect(result.platformPostId).toBe('urn:li:share:999')

    const postCall = mockFetch.mock.calls[3]
    const postBody = JSON.parse(postCall[1].body)
    expect(postBody.content.media.id).toBe('urn:li:image:12345')
    expect(postBody.mediaCategory).toBe('IMAGE')
  })

  it('publishes text-only post when no mediaUrls', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => '',
      headers: { get: (h: string) => h === 'x-restli-id' ? 'urn:li:share:888' : null },
    })

    const p = makeProvider()
    const result = await p.publishPost({ text: 'Text only' })
    expect(result.platformPostId).toBe('urn:li:share:888')
    const postBody = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(postBody.content).toBeUndefined()
    expect(postBody.mediaCategory).toBeUndefined()
  })
})
```

- [ ] **Step 5.2: Run to confirm failure**

```bash
npx jest __tests__/lib/social/providers/linkedin-media.test.ts --no-coverage 2>&1 | tail -15
```
Expected: FAIL

- [ ] **Step 5.3: Add `guessMimeType`, `uploadImageFromUrl`, `uploadVideoFromUrl` to `LinkedInProvider`**

Add before `publishPost` in `lib/social/providers/linkedin.ts`:

```typescript
  private guessMimeType(url: string): string {
    const lower = url.toLowerCase().split('?')[0]
    if (lower.endsWith('.mp4')) return 'video/mp4'
    if (lower.endsWith('.mov')) return 'video/quicktime'
    if (lower.endsWith('.gif')) return 'image/gif'
    if (lower.endsWith('.png')) return 'image/png'
    if (lower.endsWith('.webp')) return 'image/webp'
    return 'image/jpeg'
  }

  private async uploadImageFromUrl(imageUrl: string): Promise<string> {
    const res = await fetch(imageUrl)
    if (!res.ok) throw new Error(`Failed to download image: ${res.status}`)
    const buffer = Buffer.from(await res.arrayBuffer())
    const mimeType = res.headers.get('content-type') ?? 'image/jpeg'

    const headers = {
      Authorization: `Bearer ${this.credentials.accessToken}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
      'LinkedIn-Version': '202502',
    }

    const initRes = await fetch('https://api.linkedin.com/rest/images?action=initializeUpload', {
      method: 'POST',
      headers,
      body: JSON.stringify({ initializeUploadRequest: { owner: this.credentials.personUrn } }),
    })
    if (!initRes.ok) throw new Error(`LinkedIn image initializeUpload error ${initRes.status}: ${await initRes.text()}`)
    const initJson = await initRes.json() as { value: { uploadUrl: string; image: string } }

    const uploadRes = await fetch(initJson.value.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': mimeType },
      body: buffer,
    })
    if (!uploadRes.ok) throw new Error(`LinkedIn image PUT error ${uploadRes.status}: ${await uploadRes.text()}`)

    return initJson.value.image
  }

  private async uploadVideoFromUrl(videoUrl: string): Promise<string> {
    const res = await fetch(videoUrl)
    if (!res.ok) throw new Error(`Failed to download video: ${res.status}`)
    const buffer = Buffer.from(await res.arrayBuffer())
    const mimeType = res.headers.get('content-type') ?? 'video/mp4'

    const headers = {
      Authorization: `Bearer ${this.credentials.accessToken}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
      'LinkedIn-Version': '202502',
    }

    const initRes = await fetch('https://api.linkedin.com/rest/videos?action=initializeUpload', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        initializeUploadRequest: {
          owner: this.credentials.personUrn,
          fileSizeBytes: buffer.length,
          uploadCaptions: false,
          uploadThumbnail: false,
        },
      }),
    })
    if (!initRes.ok) throw new Error(`LinkedIn video initializeUpload error ${initRes.status}: ${await initRes.text()}`)
    const initJson = await initRes.json() as {
      value: {
        uploadInstructions: Array<{ uploadUrl: string; firstByte: number; lastByte: number }>
        video: string
        uploadToken: string
      }
    }

    for (const instruction of initJson.value.uploadInstructions) {
      const chunk = buffer.subarray(instruction.firstByte, instruction.lastByte + 1)
      const chunkRes = await fetch(instruction.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': mimeType },
        body: chunk,
      })
      if (!chunkRes.ok) throw new Error(`LinkedIn video chunk PUT error ${chunkRes.status}: ${await chunkRes.text()}`)
    }

    const videoUrn = initJson.value.video
    await fetch(`https://api.linkedin.com/rest/videos/${encodeURIComponent(videoUrn)}?action=finalizeUpload`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ finalizeUploadRequest: { uploadToken: initJson.value.uploadToken, uploadedPartIds: [] } }),
    })

    return videoUrn
  }
```

- [ ] **Step 5.4: Update `publishPost` to handle `mediaUrls`**

Replace the full `publishPost` method in `LinkedInProvider`:

```typescript
  async publishPost(options: PublishOptions): Promise<PublishResult> {
    let mediaUrn: string | null = null
    let mediaCategory: 'IMAGE' | 'VIDEO' | null = null

    if (options.mediaUrls && options.mediaUrls.length > 0) {
      const url = options.mediaUrls[0]
      const mimeType = this.guessMimeType(url)
      if (mimeType.startsWith('video/')) {
        mediaUrn = await this.uploadVideoFromUrl(url)
        mediaCategory = 'VIDEO'
      } else {
        mediaUrn = await this.uploadImageFromUrl(url)
        mediaCategory = 'IMAGE'
      }
    }

    const body: Record<string, unknown> = {
      author: this.credentials.personUrn,
      commentary: options.text,
      visibility: 'PUBLIC',
      distribution: {
        feedDistribution: 'MAIN_FEED',
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    }

    if (mediaUrn && mediaCategory) {
      body.content = { media: { id: mediaUrn, title: 'Media' } }
      body.mediaCategory = mediaCategory
    }

    const response = await fetch(LINKEDIN_POSTS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.credentials.accessToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
        'LinkedIn-Version': '202502',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`LinkedIn API error ${response.status}: ${text}`)
    }

    const urn = response.headers.get('x-restli-id')
    if (!urn) throw new Error('LinkedIn API did not return a post URN')

    return {
      platformPostId: urn,
      platformPostUrl: `https://www.linkedin.com/feed/update/${urn}`,
    }
  }
```

- [ ] **Step 5.5: Run tests**

```bash
npx jest __tests__/lib/social/providers/linkedin-media.test.ts --no-coverage 2>&1 | tail -15
```
Expected: PASS

- [ ] **Step 5.6: Commit**

```bash
git add lib/social/providers/linkedin.ts __tests__/lib/social/providers/linkedin-media.test.ts
git commit -m "feat: LinkedIn image and video upload + wire media into posts"
```

---

## Task 6: Threads thread support + full test run

Threads already handles `mediaUrls` via URLs in `publishPost`. The base class `publishThread` now passes `mediaUrls` to first part. Just update the `ThreadsProvider.publishThread` override to match the new signature and verify.

**Files:**
- Modify: `lib/social/providers/threads.ts`

- [ ] **Step 6.1: Update `ThreadsProvider.publishThread` signature**

Old:
```typescript
  async publishThread(parts: string[]): Promise<PublishResult[]> {
    if (parts.length === 0) throw new Error('publishThread requires at least one part')

    const results: PublishResult[] = []

    for (let i = 0; i < parts.length; i++) {
      const result = await this.publishPost({
        text: parts[i],
        replyToId: results[results.length - 1]?.platformPostId,
      })
      results.push(result)
    }

    return results
  }
```
New:
```typescript
  async publishThread(parts: string[], mediaUrls?: string[]): Promise<PublishResult[]> {
    if (parts.length === 0) throw new Error('publishThread requires at least one part')
    const results: PublishResult[] = []
    for (let i = 0; i < parts.length; i++) {
      const result = await this.publishPost({
        text: parts[i],
        replyToId: results[results.length - 1]?.platformPostId,
        mediaUrls: i === 0 ? mediaUrls : undefined,
      })
      results.push(result)
    }
    return results
  }
```

- [ ] **Step 6.2: Run full test suite**

```bash
npx jest --no-coverage 2>&1 | tail -20
```
Expected: all tests pass, no regressions

- [ ] **Step 6.3: TypeScript full check**

```bash
npx tsc --noEmit 2>&1 | grep -v "node_modules" | head -30
```
Expected: no errors

- [ ] **Step 6.4: Commit**

```bash
git add lib/social/providers/threads.ts
git commit -m "feat: update ThreadsProvider.publishThread to match mediaUrls signature"
```

---

## Task 7: Env var check + deployment

- [ ] **Step 7.1: Verify `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` is set in Vercel**

```bash
curl -H "Authorization: Bearer <VERCEL_TOKEN>" \
  "https://api.vercel.com/v9/projects/partnersinbiz-web/env" \
  | jq '.envs[] | select(.key == "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET") | .key'
```
Expected: `"NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"`

If missing, set it:
```bash
# Value is the GCS bucket name, e.g. "partners-in-biz-85059.firebasestorage.app"
# Set via Vercel dashboard: Settings → Environment Variables → Add
```

- [ ] **Step 7.2: Build check**

```bash
npm run build 2>&1 | tail -30
```
Expected: compiled successfully

- [ ] **Step 7.3: Push to deploy**

```bash
git push origin main
```

- [ ] **Step 7.4: Smoke test — upload an image and post to X**

```bash
# 1. Upload a test image
curl -X POST https://partnersinbiz.online/api/v1/social/media/upload \
  -H "Authorization: Bearer <AI_API_KEY>" \
  -H "X-Org-Id: pib-platform-owner" \
  -F "file=@/path/to/test.jpg" \
  -F "altText=Test image"
# Note the returned url

# 2. Create a post with media
curl -X POST https://partnersinbiz.online/api/v1/social/posts \
  -H "Authorization: Bearer <AI_API_KEY>" \
  -H "X-Org-Id: pib-platform-owner" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Test post with media 🖼️",
    "platforms": ["twitter"],
    "media": [{ "mediaId": "<id-from-step-1>", "type": "image", "url": "<url-from-step-1>", "thumbnailUrl": "<url>", "width": 0, "height": 0, "altText": "Test", "order": 0 }]
  }'

# 3. Publish immediately
curl -X POST https://partnersinbiz.online/api/v1/social/posts/<post-id>/publish \
  -H "Authorization: Bearer <AI_API_KEY>" \
  -H "X-Org-Id: pib-platform-owner"
```
Expected: tweet appears on X with image attached.

- [ ] **Step 7.5: Smoke test — X thread**

```bash
curl -X POST https://partnersinbiz.online/api/v1/social/posts \
  -H "Authorization: Bearer <AI_API_KEY>" \
  -H "X-Org-Id: pib-platform-owner" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Thread part 1 — intro",
    "platforms": ["twitter"],
    "threadParts": ["Thread part 1 — intro", "Thread part 2 — detail", "Thread part 3 — wrap up"]
  }'

# Then publish the post ID
```
Expected: three chained tweets appear on X.

---

## Self-Review Checklist

- [x] Firebase Storage upload — Task 1 + 2
- [x] Media wired through queue — Task 3
- [x] Media wired through publish route — Task 3
- [x] Twitter image upload — Task 4
- [x] Twitter video upload (chunked) — Task 4
- [x] Twitter threads (existing, now with first-tweet media) — Task 4
- [x] LinkedIn image upload — Task 5
- [x] LinkedIn video upload (INIT/chunk/FINALIZE) — Task 5
- [x] Threads media (URL-based, no pre-upload) — Task 6 (wiring only)
- [x] Threads thread support — Task 6
- [x] `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` env var check — Task 7
- [x] All tests pass — Task 6
- [x] TypeScript clean — Task 6
- [x] Deployed + smoke tested — Task 7

**Note on Instagram/Facebook:** Instagram and Facebook already use URL-based media (container API). With Task 3 wiring `post.media[].url` → `mediaUrls`, they will automatically receive media URLs at publish time. No provider changes needed.
