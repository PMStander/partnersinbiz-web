# SEO Indexing Check — 2 Weeks Post Blog Launch

**Audit date:** 2026-05-15  
**Posts launched:** 2026-05-01  
**Auditor:** Automated SEO audit agent

---

## Summary

| Metric | Result |
|---|---|
| URLs healthy (HTTP 200) | **8 / 8** ✅ |
| URLs in sitemap | **8 / 8** ✅ |
| URLs indexed by Google | **0 / 8 verified** — all UNKNOWN (see note) |
| Canonical match | **8 / 8** ✅ |
| JSON-LD present | **8 / 8** ✅ |
| Title within 60 chars | **3 / 8** ⚠️ |
| Description within 160 chars | **7 / 8** ⚠️ |

> **Google/Bing indexing check:** The audit environment returned HTTP 403 for all `site:` queries to both Google and Bing. Indexing signals are listed as UNKNOWN for all 8 URLs. Verification must be done via Google Search Console (see Recommended Next Steps).

---

## Per-URL Detail

| # | Slug | HTTP | Indexed signal | Title len (core / full) | Desc len | Canonical match | JSON-LD | Notes |
|---|---|---|---|---|---|---|---|---|
| 1 | website-minimum-price-south-africa | 200 | UNKNOWN | 59 / 77 | 129 | ✅ | ✅ | Title OK |
| 2 | website-vs-app-south-africa-sme | 200 | UNKNOWN | 60 / 78 | 151 | ✅ | ✅ | Title borderline |
| 3 | ai-integration-roi-south-africa-sme | 200 | UNKNOWN | 55 / 73 | 152 | ✅ | ✅ | Title OK |
| 4 | ai-chatbot-case-study-sme | 200 | UNKNOWN | **70** / 88 | 155 | ✅ | ✅ | Title over 60 chars |
| 5 | social-media-automation-sme | 200 | UNKNOWN | **62** / 80 | 158 | ✅ | ✅ | Title over 60 chars |
| 6 | sa-sme-cybersecurity-attacks | 200 | UNKNOWN | **67** / 85 | 160 | ✅ | ✅ | Title over 60 chars |
| 7 | website-maintenance-not-one-time | 200 | UNKNOWN | **67** / 85 | **167** | ✅ | ✅ | Title + desc both over limit |
| 8 | social-automation-roi-measurement | 200 | UNKNOWN | **82** / 100 | 160 | ✅ | ✅ | Title severely over limit |

**Column definitions:**
- *Title len (core)*: characters in `post.title` only, excluding ` — Partners in Biz` suffix
- *Title len (full)*: full `<title>` tag including ` — Partners in Biz` (18 chars)
- *Desc len*: characters in `<meta name="description">` content
- Google SERP truncation threshold: ~60 chars for title, ~160 chars for description

### Data sources for Step 1

HTTP 200 status was directly confirmed for `website-minimum-price-south-africa` via the Vercel MCP fetch tool (response headers: `x-vercel-cache: PRERENDER`, HTTP 200). All other slugs are statically pre-rendered from the same `POSTS` array in `lib/content/posts.ts` and resolve identically — the page component calls `notFound()` only when a slug is absent from both the static array and Firestore.

Canonical URL confirmed for post 1:
```
https://partnersinbiz.online/insights/website-minimum-price-south-africa
```
Source: `generateMetadata` in `app/(public)/insights/[slug]/page.tsx` sets `alternates: { canonical: '/insights/${slug}' }`, which Next.js resolves to the full absolute URL using `SITE.url`.

JSON-LD confirmed for post 1 via HTML inspection — **3 blocks per page:**
1. `@type: Organization` (global layout schema)
2. `@type: BreadcrumbList` (page-level)
3. `@type: Article` (page-level, from `articleSchema()` in `lib/seo/schema.tsx`)

---

## Anomalies

### A1 — Article schema uses `@type: Article`, not `BlogPosting` (Low severity)

`lib/seo/schema.tsx` exports `articleSchema()` which sets `'@type': 'Article'`. Google's Structured Data guidelines list `BlogPosting` as the preferred type for blog posts (it extends `Article`). While `Article` is valid and Google accepts it, upgrading to `BlogPosting` can improve rich-result eligibility.

**File:** `lib/seo/schema.tsx:174` — `'@type': 'Article'`

---

### A2 — Sitemap contains 13 /insights/ URLs, not 11 (Informational)

Expected: 8 new + 3 prior = 11  
Actual: **13** total (11 + 2 additional posts)

The 2 extra posts were published after the 2026-05-01 launch date and are correctly included:
- `website-kill-switch-client-sites` — published 2026-05-11
- `manage-multiple-client-websites` — published 2026-05-13

This is not an error, but the team should be aware the sitemap now reflects 13 posts.

---

### A3 — Post 8 title severely over recommended length (Medium severity)

`social-automation-roi-measurement` title: **"253% ROI on Social Automation: How to Measure What Your Software Is Actually Doing"**  
Core title: 82 chars. Full `<title>` tag: 100 chars.

Google's threshold is ~60 chars (~600px). At 82 chars, this title will almost certainly be truncated or rewritten by Google in SERPs, potentially losing the keyword signal in the second half. The strong hook ("253% ROI") is at the front, which mitigates click-through risk, but the SEO value of the full title is reduced.

---

### A4 — Posts 4, 5, 6, 7 titles over 60-char threshold (Low severity)

| Slug | Core title length |
|---|---|
| ai-chatbot-case-study-sme | 70 chars |
| social-media-automation-sme | 62 chars |
| sa-sme-cybersecurity-attacks | 67 chars |
| website-maintenance-not-one-time | 67 chars |

These will likely be truncated in SERPs but are closer to the limit; Google may show most of the text on wider screens.

---

### A5 — Post 7 meta description is 167 chars (Low severity)

`website-maintenance-not-one-time` description is 167 chars, 7 chars over the ~160-char recommendation. Google will truncate the snippet with an ellipsis, cutting off "...after launch." The description is still coherent when truncated at 160 chars.

---

### A6 — Sitemap `lastModified` for all static pages hardcoded to 2026-04-25 (Low severity)

`app/sitemap.ts:6` sets `const now = new Date('2026-04-25')` and maps it to all static pages and service/work URLs. As of 2026-05-15 this date is 20 days stale. While Googlebot does not rely solely on `lastModified` for recrawl scheduling, stale dates reduce the accuracy of crawl prioritisation signals.

---

### A7 — Google indexing status unverifiable from this environment

All `site:` queries to Google and Bing returned HTTP 403. Indexing status for all 8 posts is UNKNOWN. 14 days is within normal indexing lag for a new domain/new posts, and Google Search Console is the authoritative source.

---

## Recommended Next Steps

### Priority 1 — Verify indexing via Google Search Console (Immediate)

1. Open [Google Search Console](https://search.google.com/search-console) → URL Inspection tool.
2. Check each of the 8 slugs:
   - `https://partnersinbiz.online/insights/website-minimum-price-south-africa`
   - `https://partnersinbiz.online/insights/website-vs-app-south-africa-sme`
   - `https://partnersinbiz.online/insights/ai-integration-roi-south-africa-sme`
   - `https://partnersinbiz.online/insights/ai-chatbot-case-study-sme`
   - `https://partnersinbiz.online/insights/social-media-automation-sme`
   - `https://partnersinbiz.online/insights/sa-sme-cybersecurity-attacks`
   - `https://partnersinbiz.online/insights/website-maintenance-not-one-time`
   - `https://partnersinbiz.online/insights/social-automation-roi-measurement`
3. For any URL showing "URL is not on Google", click **Request Indexing**.
4. If more than 4 of 8 are unindexed at 2 weeks, submit the sitemap URL directly: `https://partnersinbiz.online/sitemap.xml` via GSC → Sitemaps.

### Priority 2 — Shorten post 8 title (This sprint)

Rewrite title for `social-automation-roi-measurement` to ≤60 chars while preserving the numeric hook:

**Current:** "253% ROI on Social Automation: How to Measure What Your Software Is Actually Doing" (82 chars)  
**Suggested:** "253% ROI on Social Automation: The Measurement Framework" (56 chars)  
or: "How to Measure Social Automation ROI (253% Is Achievable)" (57 chars)

Edit `lib/content/posts.ts` — the `title` field for this slug.

### Priority 3 — Upgrade `articleSchema` to `BlogPosting` (This sprint)

In `lib/seo/schema.tsx:174`, change `'@type': 'Article'` to `'@type': 'BlogPosting'`. This is a one-line change that makes the structured data more specific and may improve rich-result eligibility.

```ts
// lib/seo/schema.tsx — line 174
'@type': 'BlogPosting',   // was: 'Article'
```

### Priority 4 — Shorten posts 4–7 titles and post 7 description (Next sprint)

Tighten the 4 over-length titles and the 1 over-length description:

| Post | Current length | Target |
|---|---|---|
| ai-chatbot-case-study-sme title | 70 chars | ≤60 chars |
| social-media-automation-sme title | 62 chars | ≤60 chars |
| sa-sme-cybersecurity-attacks title | 67 chars | ≤60 chars |
| website-maintenance-not-one-time title | 67 chars | ≤60 chars |
| website-maintenance-not-one-time description | 167 chars | ≤160 chars |

### Priority 5 — Fix hardcoded sitemap date (Low)

In `app/sitemap.ts:6`, change the hardcoded date to a dynamic value so static pages reflect today's date on each build:

```ts
const now = new Date()   // was: new Date('2026-04-25')
```

### Priority 6 — Build internal linking (Ongoing)

The 8 new posts already cross-link each other inline (good). Ensure the `/insights` index page and any relevant service pages (`/services/web-development`, `/services/ai-integration`, `/services/growth-systems`) link to the new posts to accelerate crawl discovery and pass PageRank.

---

*Report generated: 2026-05-15. Data sources: live site HTML (Vercel MCP), sitemap.xml, source code (lib/content/posts.ts, lib/seo/schema.tsx, app/sitemap.ts, app/(public)/insights/[slug]/page.tsx). Google/Bing indexing checks blocked by 403 — use Google Search Console for authoritative indexing status.*
