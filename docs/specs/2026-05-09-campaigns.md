# Campaigns — content-engine integration spec

**Status:** in build (2026-05-09). Author: Pip.

## Why

The `client-content-engine` skill produces 75+ assets (research dossier, brand lock, pillars, 12-week calendar, 8 blogs, 6 videos × 3 formats, 12 weeks of social, hero images, social cards) and deploys them to a throwaway Vercel preview site with localStorage approve buttons. We're moving it inside the PiB platform so:

- One source of truth (Firestore) instead of localStorage drift
- Real audit log + activity feed + tenant scoping
- Client reviews + approves + requests changes inside the portal they already use
- Agent + Hermes can query "what's awaiting approval" with one call
- SEO sprint (strategy layer) and campaigns (production layer) share the same blog records

## What stays vs what changes

The platform already has 80% of what we need:
- `social_posts` with `status: draft|pending_approval|approved|scheduled|published|...` + `/approve` + `/comments` (= "request changes" thread)
- `seo_content` + `seo_drafts` + `/draft` (now real after commit `cf540da`) + `/publish`
- `/ai/generate` + `/ai/image` + `/ai/repurpose` + `/media/upload` for AI generation + asset hosting
- `/posts/bulk/` for calendar bulk-create
- Full multi-tenant + audit + activity infra

What's missing and we're adding:
1. **`campaigns` collection** — the grouping concept the platform lacks. Holds research, brand identity, pillars, calendar, status, share token.
2. **`campaignId` field on `social_posts` and `seo_content`** — additive, no migration. Lets us roll up everything in one campaign.
3. **Video as first-class** — extend `social_posts.media` to support `type: 'video'` with multi-format URLs (vertical Reel, 16:9 YouTube, 15s Stories cut). No new collection.
4. **Platform-mockup review UI** — `/admin/campaigns/[id]` and `/portal/campaigns/[id]` with Instagram feed / LinkedIn card / YouTube thumb / Reels player / blog reader mockups, per-asset Approve / Request Changes / Edit, batch approve.
5. **Public read-only share view** — `/c/[shareToken]` for sales pitches. Replaces the throwaway Vercel preview.

What does NOT change:
- The 9-phase content-engine pipeline. Same orchestration, same parallel subagent wave. Just outputs go to API instead of local files.
- The video render pipeline (HyperFrames + ffmpeg + procedural music). Vercel Functions can't render video in 60s. Render locally, upload via `/media/upload`, register on the post.
- The brand-identity lock at the start of a run. Stored on the campaign.

## Data model

### `campaigns` collection

```ts
interface Campaign {
  id: string                    // Firestore-generated
  orgId: string                 // tenant
  clientId: string              // === orgId for now (future-proofed)
  name: string                  // "Properties launch", "AHS Law Q3", etc.
  clientType: 'service-business' | 'consumer-app' | 'b2b-saas'
  status: 'draft' | 'in_review' | 'approved' | 'shipping' | 'archived'

  // Phase 1 output — research dossier
  research: {
    audiences: AudienceProfile[]    // segments with pain points, language, channels
    voice: { do: string[]; dont: string[]; sampleParagraph: string }
    taglines: { master: string; layered: { hero: string; analytics: string; simplification: string } }
    channels: ChannelMix             // platform allocation (LI heavy / X / Reddit / etc.)
    citations: CitationSource[]      // external quotes/stats with URLs
    confidence: 'low' | 'medium' | 'high'
    notes: string                    // any flags from research phase
  }

  // Phase 2 output — master plan
  brandIdentity: {
    palette: { bg: string; accent: string; alert: string; text: string; muted?: string }
    typography: { heading: string; body: string; numeric?: string }
    logoUrl?: string
    aestheticKeywords: string[]      // for image prompts
    tone: string                     // "founder-direct, no fluff" etc.
  }
  pillars: Array<{ id: string; name: string; description: string; weight: number }>
  calendar: Array<{
    day: number                      // 1-N (e.g. 1-84 for 12 weeks)
    date: string                     // ISO yyyy-mm-dd
    audience: 'A' | 'B'              // existing-clients vs prospects
    pillarId: string
    channel: string                  // 'linkedin' | 'twitter' | 'blog' | 'video' | 'email' | ...
    format: string                   // 'post' | 'carousel' | 'thread' | 'pillar-blog' | 'reel' | ...
    title: string
    assetId?: string                 // populated once the asset is created
    assetType?: 'social_post' | 'seo_content' | 'video'
  }>

  // Public preview
  shareToken: string                 // 24-char hex; powers /c/[shareToken]
  shareEnabled: boolean              // default true; toggle off to revoke

  // Audit
  createdAt: Timestamp
  createdBy: string
  createdByType: 'user' | 'agent' | 'system'
  updatedAt: Timestamp
  updatedBy: string
  updatedByType: 'user' | 'agent' | 'system'
  deleted: boolean                   // soft delete
}

interface AudienceProfile {
  id: 'A' | 'B' | string
  label: string                      // "Existing PiB clients" / "SA agency owners" / etc.
  painPoints: string[]
  language: string[]                 // verbatim phrases the audience uses
  channels: string[]                 // where they live
  topInsights: string[]              // 3 most important things from research
}

interface ChannelMix {
  primary: string[]                  // e.g. ['linkedin', 'twitter']
  secondary: string[]
  experimental: string[]
}

interface CitationSource {
  quote: string
  speaker?: string
  publication: string
  url: string
  date?: string
}
```

### Additions to existing collections

```ts
// social_posts — add (no migration; just additive optional field)
interface SocialPost {
  // ... existing fields ...
  campaignId?: string
  pillarId?: string
  audience?: 'A' | 'B' | string

  // For type: 'video' posts — extended media
  media?: Array<
    | { type: 'image'; url: string; alt?: string }
    | {
        type: 'video'
        url: string                  // primary (vertical Reel)
        urlYoutube?: string          // 16:9 horizontal
        urlStories?: string          // 15s vertical cut
        durationSec?: number
        thumbnailUrl?: string
      }
  >
}

// seo_content — add
interface SeoContent {
  // ... existing fields ...
  campaignId?: string
  pillarId?: string
}
```

## API contract

### Campaigns

```
GET    /api/v1/campaigns                      list (filter: orgId, status; admin sees all)
POST   /api/v1/campaigns                      create (used by content-engine skill)
GET    /api/v1/campaigns/[id]                 single, includes asset roll-up
PATCH  /api/v1/campaigns/[id]                 update (calendar, brand, status)
POST   /api/v1/campaigns/[id]/archive         soft archive
POST   /api/v1/campaigns/[id]/approve-all     batch: { type?: 'social' | 'seo_content' | 'video' | 'all' }
GET    /api/v1/campaigns/[id]/assets          assets across collections, joined by campaignId
```

Public route (no auth, share-token-gated):

```
GET    /api/v1/public/campaigns/[shareToken]  read-only campaign + assets
```

### Roll-up shape returned by `GET /campaigns/[id]/assets`

```ts
interface CampaignAssets {
  campaignId: string
  social: SocialPost[]               // type: 'image' | 'video' | text-only
  blogs: Array<SeoContent & { draft?: { wordCount: number; generatedBy: string } }>
  videos: SocialPost[]               // posts with media[0].type === 'video'
  meta: {
    totals: { social: number; blogs: number; videos: number }
    byStatus: { draft: number; pending_approval: number; approved: number; published: number }
  }
}
```

### Existing endpoints we reuse (no change)

- `POST /api/v1/social/posts` (with `campaignId` in body now)
- `POST /api/v1/social/posts/[id]/approve` — `{ action: 'approve' | 'reject' }`
- `POST /api/v1/social/posts/[id]/comments` — `{ text }` — **acts as "Request Changes"** when status flips back to `draft`
- `POST /api/v1/seo/content` (with `campaignId` in body now)
- `POST /api/v1/seo/content/[id]/draft` — already real (commit cf540da)
- `POST /api/v1/seo/content/[id]/publish`
- `POST /api/v1/social/ai/generate` / `/ai/image` / `/ai/repurpose`
- `POST /api/v1/social/media/upload` (multipart) / `/media/` (URL register)

### Auth + tenant rules

- All campaign reads/writes scoped to `orgId` via `withTenant`.
- Role `ai` (AI_API_KEY) bypasses tenant check — agent can run engine for any client.
- Public share token route bypasses auth entirely; only returns campaign + assets where `campaignId` matches and `shareEnabled === true`.

## UI contract

### Routes

- `/admin/campaigns` — operator index (all campaigns across all orgs)
- `/admin/org/[slug]/campaigns` — per-client campaign list
- `/admin/campaigns/[id]` — campaign cockpit, tabs: **Today / Calendar / Brand / Blogs / Videos / Social / Research / Settings**
- `/portal/campaigns` — client-side campaign list (their org only)
- `/portal/campaigns/[id]` — client review surface, same tabs minus Settings
- `/c/[shareToken]` — public read-only sales-pitch view

### Per-asset card components

Pure presentational, no data fetching. Take a typed asset as a prop, render a platform-realistic mockup.

```ts
<InstagramFeedCard post={SocialPost} />              // square feed tile w/ caption preview
<InstagramReelsCard post={SocialPost} />             // 9:16 vertical w/ video player
<InstagramStoriesCard post={SocialPost} />           // 9:16 with 15s indicator
<FacebookFeedCard post={SocialPost} />               // FB feed style
<LinkedInPostCard post={SocialPost} />               // LI card with author + reactions row
<TwitterPostCard post={SocialPost} />                // X card
<YouTubeCard post={SocialPost} />                    // 16:9 thumbnail + title + channel
<BlogReaderCard blog={SeoContent} draft?={SeoDraft} />  // article reader pane

<AssetActions assetId={string} type={...} status={...} onApprove onRequestChanges onEdit />
```

The mockups render against the **REAL** asset data + the campaign's brand identity (palette, fonts). When the user changes the brand, every card re-renders.

### Behaviours

- **Approve**: per-asset → calls existing `/posts/[id]/approve` or `/seo/content/[id]/publish`. Batch-approve at type level → `/campaigns/[id]/approve-all`.
- **Request Changes**: opens a small modal, captures text, posts to `/posts/[id]/comments` (or new `/seo/content/[id]/comments` — needs a sibling endpoint). Status flips to `draft` ("needs work") with a badge counting pending change requests.
- **Edit**: inline editor; PATCHes the asset record. For blogs, edits the `seo_drafts` body.

## Build slices (parallel)

| Slice | Owner | Files |
|---|---|---|
| **A. Backend primitives** | sub-agent A | `lib/types/campaign.ts`, `app/api/v1/campaigns/**`, `lib/seo/**` (campaignId field tweaks) |
| **B. Mockup component library** | sub-agent B | `components/campaign-preview/*` |
| **C. Skill move + rewrite** | sub-agent C | `partnersinbiz-web/.claude/skills/content-engine/*` |
| **D. Review UI integration** | Pip (after A+B) | `app/(admin)/admin/campaigns/**`, `app/(portal)/portal/campaigns/**`, `app/c/[token]/page.tsx` |

## Design decisions (locked)

- **Videos live on `social_posts`, not a separate collection.** Multi-format URLs ride on `media[0]`.
- **Comments are "request changes".** No new verb endpoint. The existing thread + status flip is the workflow. Add `/seo/content/[id]/comments` to mirror.
- **`shareToken` is on the campaign, not the assets.** One token unlocks the full preview site.
- **Approval routes through existing per-asset endpoints.** `/campaigns/[id]/approve-all` is just a fan-out helper.
- **Calendar is stored on the campaign, not derived.** Each row may or may not have an `assetId` — the calendar exists before assets are produced. When the engine produces an asset, it backfills `assetId`.
- **Research is a campaign field, not a separate collection.** It's a snapshot tied to the run.
- **No migration of existing `seo_content` rows.** They keep `campaignId === undefined`. The 5 Properties drafts will get manually attached to a "Properties launch" campaign as the first test.
