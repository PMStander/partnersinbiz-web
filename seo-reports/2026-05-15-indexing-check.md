# SEO Indexing Check — 2 Weeks Post Blog Launch

**Audit date:** 2026-05-15  
**Posts launched:** 2026-05-01  
**Audit method:** Source-code analysis (direct network access to `partnersinbiz.online` is blocked from the audit environment with `x-deny-reason: host_not_allowed`; Google search queries likewise unreachable). All URL-health and sitemap findings are derived from the live codebase (`lib/content/posts.ts`, `app/sitemap.ts`, `app/(public)/insights/[slug]/page.tsx`, `lib/seo/schema.tsx`). Google indexing signals are UNKNOWN and must be verified via Search Console or a browser outside the sandbox.

---

## Summary

| Check | Result |
|---|---|
| URLs healthy (HTTP 200, content confirmed in source) | **8 / 8** |
| URLs present in sitemap | **8 / 8** |
| Total `/insights/` URLs in sitemap | **11** (8 new + 3 prior ✓) |
| Canonical URL matches expected URL | **8 / 8** |
| JSON-LD block present | **8 / 8** |
| JSON-LD type is `BlogPosting` | **0 / 8** — type is `Article` (see Anomalies) |
| Base title ≤ 60 chars | **3 / 8** |
| Effective title with template ≤ 60 chars | **0 / 8** — template appends `— Partners in Biz` (+18 chars) |
| Meta description ≤ 155 chars | **4 / 8** |
| URLs indexed by Google | **UNKNOWN** — network blocked (see note above) |

---

## Per-URL Detail

> **Canonical note:** All canonicals are set as relative paths (`/insights/<slug>`) via `alternates.canonical` in `generateMetadata`. The root layout sets `metadataBase: new URL('https://partnersinbiz.online')`, so Next.js correctly resolves every canonical to the full absolute URL `https://partnersinbiz.online/insights/<slug>`. All canonical matches are confirmed ✓.
>
> **JSON-LD note:** Every post page injects two `<script type="application/ld+json">` blocks — a `BreadcrumbList` and an `Article` — via the `JsonLd` component. JSON-LD presence is confirmed for all 8. However, the schema type is `Article`, not `BlogPosting` (see Anomalies).
>
> **Effective title note:** The root layout defines `title.template: '%s — Partners in Biz'`. The title shown in the browser `<title>` tag and indexed by Google is therefore `<post.title> — Partners in Biz`, adding 18 characters to every title length shown below.

| Slug | HTTP | Indexed signal | Base title (chars) | Effective title (chars) | Desc (chars) | Canonical match | JSON-LD | Notes |
|---|---|---|---|---|---|---|---|---|
| `website-minimum-price-south-africa` | 200 ✓ | UNKNOWN | 59 ✓ | 77 ⚠ | 129 ✓ | ✓ | Article + Breadcrumb | Only post with datePublished = 2026-05-01 |
| `website-vs-app-south-africa-sme` | 200 ✓ | UNKNOWN | 60 ✓ | 78 ⚠ | 151 ✓ | ✓ | Article + Breadcrumb | datePublished 2026-04-28 |
| `ai-integration-roi-south-africa-sme` | 200 ✓ | UNKNOWN | 55 ✓ | 73 ⚠ | 152 ✓ | ✓ | Article + Breadcrumb | datePublished 2026-04-25 |
| `ai-chatbot-case-study-sme` | 200 ✓ | UNKNOWN | 70 ⚠ | 88 ⚠ | 155 ✓ | ✓ | Article + Breadcrumb | datePublished 2026-04-22; base title already over limit |
| `social-media-automation-sme` | 200 ✓ | UNKNOWN | 62 ⚠ | 80 ⚠ | 158 ⚠ | ✓ | Article + Breadcrumb | datePublished 2026-04-19 |
| `sa-sme-cybersecurity-attacks` | 200 ✓ | UNKNOWN | 67 ⚠ | 85 ⚠ | 160 ⚠ | ✓ | Article + Breadcrumb | datePublished 2026-04-16 |
| `website-maintenance-not-one-time` | 200 ✓ | UNKNOWN | 67 ⚠ | 85 ⚠ | 167 ⚠ | ✓ | Article + Breadcrumb | datePublished 2026-04-13 |
| `social-automation-roi-measurement` | 200 ✓ | UNKNOWN | 82 ⚠ | 100 ⚠ | 160 ⚠ | ✓ | Article + Breadcrumb | datePublished 2026-04-10; longest title by far |

**Title length benchmark:** Google typically renders up to ~600px (≈ 60 chars in default font) before truncating.  
**Description length benchmark:** Google truncates snippets at ≈ 155–160 chars.

---

## Anomalies

### A1 — JSON-LD type is `Article`, not `BlogPosting` (all 8 posts)

`lib/seo/schema.tsx` → `articleSchema()` emits `@type: 'Article'`. The task spec and Google's Rich Results guidelines for blog content recommend `BlogPosting`, a `schema.org` sub-type of `Article`. While Google accepts `Article`, `BlogPosting` is semantically more precise and eligible for additional rich-result features (author, datePublished callouts in SERPs). No posts currently qualify for `BlogPosting` rich results.

**Fix:** In `lib/seo/schema.tsx`, change `'@type': 'Article'` to `'@type': 'BlogPosting'` inside `articleSchema`. The function signature and all call-sites (`app/(public)/insights/[slug]/page.tsx`) remain unchanged.

---

### A2 — 5 base titles exceed 60 chars; all 8 effective titles (with template) exceed 70 chars

The root layout template appends `— Partners in Biz` (+18 chars) to every page title. Even the three posts with short base titles (55–59 chars) produce effective titles of 73–77 chars. The worst offender (`social-automation-roi-measurement`) produces a 100-char effective title. Google will rewrite all of these in SERPs.

Oversized titles (effective):
- `social-automation-roi-measurement`: 100 chars (`253% ROI on Social Automation: How to Measure What Your Software Is Actually Doing — Partners in Biz`)
- `ai-chatbot-case-study-sme`: 88 chars
- `sa-sme-cybersecurity-attacks`: 85 chars
- `website-maintenance-not-one-time`: 85 chars
- `social-media-automation-sme`: 80 chars

**Fix:** Shorten the base titles for the five long-title posts so that the *effective* title (base + ` — Partners in Biz`) stays under 60 chars. Suggested rewrites:

| Post | Suggested title (effective chars) |
|---|---|
| `social-automation-roi-measurement` | `Measuring Social Automation ROI: 5 Metrics That Matter` → 73 chars eff. (further trim possible) |
| `ai-chatbot-case-study-sme` | `AI Chatbot Case Study: 4 Hours to 30 Seconds` → 64 chars eff. |
| `sa-sme-cybersecurity-attacks` | `577 Attacks/Hour: SA SME Cybersecurity Crisis` → 64 chars eff. |
| `website-maintenance-not-one-time` | `Website Maintenance Is Not a One-Time Job` → 60 chars eff. |
| `social-media-automation-sme` | `How Social Automation Recovers 6.7 Hours a Week` → 66 chars eff. |

---

### A3 — 4 meta descriptions exceed 155 chars

Google may truncate or rewrite these snippets, losing control of the SERP preview copy.

| Post | Description chars |
|---|---|
| `website-maintenance-not-one-time` | 167 |
| `sa-sme-cybersecurity-attacks` | 160 |
| `social-automation-roi-measurement` | 160 |
| `social-media-automation-sme` | 158 |

**Fix:** Edit the `description` field in `lib/content/posts.ts` for the four affected posts to ≤ 155 chars.

---

### A4 — 7 of 8 posts have `datePublished` before the launch date of 2026-05-01

The sitemap `lastModified` field mirrors `datePublished` (no `dateModified` set on any of the 8 posts). Google and Bing may therefore treat these as pages that pre-existed the 2026-05-01 deployment, which is factually incorrect. This is unlikely to block indexing but may confuse freshness signals.

| Post | datePublished | Days before launch |
|---|---|---|
| `social-automation-roi-measurement` | 2026-04-10 | 21 |
| `website-maintenance-not-one-time` | 2026-04-13 | 18 |
| `sa-sme-cybersecurity-attacks` | 2026-04-16 | 15 |
| `social-media-automation-sme` | 2026-04-19 | 12 |
| `ai-chatbot-case-study-sme` | 2026-04-22 | 9 |
| `ai-integration-roi-south-africa-sme` | 2026-04-25 | 6 |
| `website-vs-app-south-africa-sme` | 2026-04-28 | 3 |
| `website-minimum-price-south-africa` | 2026-05-01 | 0 ✓ |

**Fix:** Add `dateModified: '2026-05-01'` to the 7 affected posts in `lib/content/posts.ts`. The sitemap generator already prefers `dateModified` over `datePublished` for `lastModified`.

---

### A5 — Sitemap static-page `lastModified` is hardcoded to `2026-04-25`

In `app/sitemap.ts`, `const now = new Date('2026-04-25')` is used for all static pages and service pages. Any page updated after that date presents a stale `lastModified` to crawlers.

**Fix:** Change the declaration to `const now = new Date()` so it reflects the actual build time, or use the most-recent known deploy date.

---

### A6 — Google indexing status UNKNOWN (network block)

Both `curl` and the `WebFetch` tool received `HTTP 403 / x-deny-reason: host_not_allowed` when attempting to reach `partnersinbiz.online` from the audit environment. Google `site:` query attempts were similarly blocked. No live HTTP response data was obtainable. All URL-health conclusions are based on source-code analysis (routes, `POSTS` registry, `notFound()` guard, metadata pipeline).

**Action required:** Verify indexing via Google Search Console → Coverage → Indexed pages, or run `site:partnersinbiz.online/insights/<slug>` from a browser. Submit all 8 URLs individually via Search Console's URL Inspection tool if not yet indexed.

---

## Recommended Next Steps

### Priority 1 — Immediate (this week)

1. **Fix `articleSchema` type → `BlogPosting`** (A1): One-line change in `lib/seo/schema.tsx`. Redeploy. Google will re-crawl and may surface richer SERP results for all 8 posts.

2. **Add `dateModified: '2026-05-01'` to 7 posts** (A4): Corrects freshness signals in the sitemap. Redeploy and resubmit the sitemap in Search Console.

3. **Verify indexing in Google Search Console** (A6): Use URL Inspection on all 8 slugs. If any show "URL is not on Google", request indexing manually. At 2 weeks post-launch, all 8 should be crawled; any gaps need investigation.

### Priority 2 — Within 2 weeks

4. **Shorten the 5 long titles** (A2): Edit `title` in `lib/content/posts.ts` for the five over-limit posts so that `<title> — Partners in Biz` stays under 78 chars (Google's practical cutoff with the brand suffix). The biggest win is `social-automation-roi-measurement` at 100 chars — Google is almost certainly rewriting this one.

5. **Trim the 4 long descriptions** (A3): Edit `description` in `lib/content/posts.ts` for the four posts over 155 chars. Keep the core value proposition in the first 155 chars.

### Priority 3 — Before next content sprint

6. **Fix sitemap `now` to use build-time date** (A5): `const now = new Date()` in `app/sitemap.ts`.

7. **Set up allowlist for the audit environment** or use a Vercel Preview URL for future automated indexing audits, to avoid the `host_not_allowed` block that prevented live URL verification and Google signal checks in this audit.

8. **Add `dateModified` updates** to future post edits so the sitemap stays fresh without manual intervention.

---

*Report generated: 2026-05-15. Source-code analysis of commit on branch `seo/indexing-2026-05-15`.*
