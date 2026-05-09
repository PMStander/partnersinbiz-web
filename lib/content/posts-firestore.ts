/**
 * Firestore-backed blog post loader.
 *
 * The legacy hardcoded `POSTS` array in `posts.ts` covers a static set of
 * historical insights. New posts go through the SEO content engine and live
 * in Firestore as `seo_content` rows with hydrated bodies in `seo_drafts`.
 *
 * This module bridges the two: when a slug isn't in the static array, fall
 * back to Firestore where `status === 'live'` and `slug` matches.
 *
 * Design decisions:
 *  - Pure server-side (uses adminDb). Don't import this from client components.
 *  - Returns the canonical `Post` shape so existing renderers don't change.
 *  - Slug derivation: prefer the persisted `slug` field on seo_content; fall
 *    back to deriving from `targetUrl` path segment for backfill.
 */
import { adminDb } from '@/lib/firebase/admin'
import type { Post } from './posts'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = any

export function slugFromTargetUrl(targetUrl: string | undefined): string | null {
  if (!targetUrl) return null
  try {
    const u = new URL(targetUrl)
    const last = u.pathname.replace(/\/+$/, '').split('/').filter(Boolean).pop()
    return last ? decodeURIComponent(last) : null
  } catch {
    // not a URL — assume it's already a slug or path
    const last = targetUrl.replace(/\/+$/, '').split('/').filter(Boolean).pop()
    return last ?? null
  }
}

const VALID_CATEGORIES: ReadonlyArray<Post['category']> = [
  'Build Notes',
  'Case Studies',
  'Industry POV',
  'Tools',
]

function clampCategory(value: unknown): Post['category'] {
  if (typeof value === 'string') {
    const match = VALID_CATEGORIES.find(
      c => c.toLowerCase() === value.toLowerCase(),
    )
    if (match) return match
  }
  return 'Industry POV'
}

function ensureLeadingSlash(path: string | undefined | null): string {
  if (!path) return '/images/insight-pricing-za.jpg' // fallback cover
  return path.startsWith('http') || path.startsWith('/') ? path : `/${path}`
}

function readingTimeFromWordCount(wc?: number): string {
  if (!wc || wc <= 0) return '6 min'
  return `${Math.max(1, Math.round(wc / 220))} min`
}

interface SeoContentDoc {
  id: string
  data: AnyObj
}

async function fetchLiveSeoContent(slug: string): Promise<SeoContentDoc | null> {
  // First try persisted slug
  const bySlug = await adminDb
    .collection('seo_content')
    .where('slug', '==', slug)
    .where('status', '==', 'live')
    .limit(1)
    .get()
  if (!bySlug.empty) {
    const d = bySlug.docs[0]
    return { id: d.id, data: d.data() }
  }
  // Fallback: scan live content + match derived slug from targetUrl
  // (only for backfill — new publishes persist `slug` directly)
  const live = await adminDb
    .collection('seo_content')
    .where('status', '==', 'live')
    .limit(50)
    .get()
  for (const d of live.docs) {
    const data = d.data()
    if (data.slug === slug) return { id: d.id, data }
    const derived = slugFromTargetUrl(data.targetUrl)
    if (derived === slug) return { id: d.id, data }
  }
  return null
}

async function hydrateBody(draftPostId: string | undefined): Promise<{ body: string; wordCount?: number; meta?: string } | null> {
  if (!draftPostId) return null
  const snap = await adminDb.collection('seo_drafts').doc(draftPostId).get()
  if (!snap.exists) return null
  const d = snap.data() as AnyObj
  return {
    body: typeof d.body === 'string' ? d.body : '',
    wordCount: typeof d.wordCount === 'number' ? d.wordCount : undefined,
    meta: typeof d.metaDescription === 'string' ? d.metaDescription : undefined,
  }
}

/**
 * Look up a `live` blog post in Firestore by slug, then hydrate its body
 * from `seo_drafts`. Returns the canonical `Post` shape ready for the
 * existing /insights/[slug] renderer. Returns null if no match.
 */
export async function getFirestorePostBySlug(slug: string): Promise<Post | null> {
  const doc = await fetchLiveSeoContent(slug)
  if (!doc) return null
  const { data } = doc
  const draft = await hydrateBody(data.draftPostId as string | undefined)
  if (!draft || !draft.body) return null

  const dateRaw = (data.publishDate as string | undefined)
    ?? (data.publishedAt && (data.publishedAt._seconds ?? data.publishedAt.seconds)
      ? new Date((data.publishedAt._seconds ?? data.publishedAt.seconds) * 1000).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10))

  return {
    slug,
    title: typeof data.title === 'string' ? data.title : 'Untitled',
    description: draft.meta || (draft.body.slice(0, 200).replace(/\s+/g, ' ').trim()),
    category: clampCategory(data.type ?? data.category),
    readingTime: readingTimeFromWordCount(draft.wordCount),
    datePublished: dateRaw,
    cover: ensureLeadingSlash(data.heroImageUrl as string | undefined),
    tags: Array.isArray(data.tags) ? (data.tags as string[]) : [],
    body: draft.body,
  }
}

/**
 * List slugs of all currently-live `seo_content` rows. Used to extend
 * `generateStaticParams` so SSG covers Firestore-backed posts too.
 */
export async function listLiveSlugs(): Promise<string[]> {
  const snap = await adminDb
    .collection('seo_content')
    .where('status', '==', 'live')
    .limit(200)
    .get()
  const slugs = new Set<string>()
  for (const d of snap.docs) {
    const data = d.data() as AnyObj
    const persistedSlug = typeof data.slug === 'string' ? data.slug : null
    const derived = persistedSlug ?? slugFromTargetUrl(data.targetUrl as string | undefined)
    if (derived) slugs.add(derived)
  }
  return Array.from(slugs)
}
