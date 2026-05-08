/**
 * AI-powered SEO asset generators.
 *
 * Uses Vercel AI Gateway → Claude Haiku. Automatically falls back to
 * deterministic templates if the AI call fails or returns unparseable output.
 *
 * All async functions are safe to call from Next.js API routes — they do not
 * import Firebase or any Node-only module, so they are edge-compatible.
 */
import { generateText } from 'ai'
import { BRIEF_MODEL, DRAFT_MODEL } from '@/lib/ai/client'

// ---------------------------------------------------------------------------
// Slug generator (deterministic — no AI needed)
// ---------------------------------------------------------------------------

export function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function templateTitles(topic: string, keyword: string): string[] {
  return [
    `${topic} | ${keyword} — A complete guide`,
    `The best ${keyword} for ${topic} (2026)`,
    `${keyword}: how to ${topic} the right way`,
    `${topic} with ${keyword} — what works in 2026`,
    `Why ${keyword} matters for ${topic}`,
  ].map((t) => (t.length > 60 ? t.slice(0, 57).trimEnd() + '…' : t))
}

function templateMetas(topic: string, keyword: string): string[] {
  return [
    `Everything you need to know about ${keyword} for ${topic}. Practical guide with real examples.`,
    `${topic}? Here's how ${keyword} fits in — with checklists, mistakes to avoid, and what works in 2026.`,
    `Stop guessing about ${keyword}. This guide covers ${topic} step by step, with case studies and tools.`,
  ].map((d) => (d.length > 160 ? d.slice(0, 157).trimEnd() + '…' : d))
}

/** Parse a numbered or bulleted list from AI output into an array of strings. */
function parseList(raw: string): string[] {
  return raw
    .split('\n')
    .map((l) => l.replace(/^[\d\-\*\•\.]+\s*/, '').trim())
    .filter((l) => l.length > 10)
}

// ---------------------------------------------------------------------------
// Title candidates
// ---------------------------------------------------------------------------

/**
 * Generate 5 SEO-optimised title tag candidates for a given topic + keyword.
 * Falls back to deterministic templates if AI is unavailable.
 *
 * Each title is capped at 60 characters (Google's display cutoff).
 */
export async function generateTitleCandidates(topic: string, keyword: string): Promise<string[]> {
  try {
    const { text } = await generateText({
      model: BRIEF_MODEL,
      system:
        'You are an SEO copywriter. Output ONLY a numbered list of exactly 5 title tag options. ' +
        'No explanations, no preamble. Each title must be under 60 characters, include the keyword naturally, ' +
        'and be compelling for click-through. Format: one per line, numbered 1–5.',
      prompt: `Topic: ${topic}\nTarget keyword: ${keyword}\n\nGenerate 5 title tag candidates.`,
      maxOutputTokens: 300,
    })

    const candidates = parseList(text)
      .slice(0, 5)
      .map((t) => (t.length > 60 ? t.slice(0, 57).trimEnd() + '…' : t))

    if (candidates.length >= 3) return candidates
  } catch {
    // AI unavailable — fall through to templates
  }

  return templateTitles(topic, keyword)
}

// ---------------------------------------------------------------------------
// Meta description candidates
// ---------------------------------------------------------------------------

/**
 * Generate 3 meta description candidates for a given topic + keyword.
 * Falls back to deterministic templates if AI is unavailable.
 *
 * Each description is capped at 160 characters (Google's display cutoff).
 */
export async function generateMetaCandidates(topic: string, keyword: string): Promise<string[]> {
  try {
    const { text } = await generateText({
      model: BRIEF_MODEL,
      system:
        'You are an SEO copywriter. Output ONLY a numbered list of exactly 3 meta description options. ' +
        'No explanations, no preamble. Each description must be under 160 characters, include the keyword ' +
        'naturally, and entice users to click. Format: one per line, numbered 1–3.',
      prompt: `Topic: ${topic}\nTarget keyword: ${keyword}\n\nGenerate 3 meta description candidates.`,
      maxOutputTokens: 300,
    })

    const candidates = parseList(text)
      .slice(0, 3)
      .map((d) => (d.length > 160 ? d.slice(0, 157).trimEnd() + '…' : d))

    if (candidates.length >= 2) return candidates
  } catch {
    // AI unavailable — fall through to templates
  }

  return templateMetas(topic, keyword)
}

// ---------------------------------------------------------------------------
// Blog draft body
// ---------------------------------------------------------------------------

export interface BlogDraft {
  title: string
  metaDescription: string
  body: string
  wordCount: number
  generatedBy: 'ai' | 'template'
}

function templateBlogBody(title: string, keyword: string, targetUrl?: string): string {
  const cta = targetUrl
    ? `\n\n## Get started\n\n[Try Partners in Biz Properties](${targetUrl}) — set up a property in under five minutes.\n`
    : ''
  return `# ${title}\n\n_This is a placeholder draft. Replace with real copy before publishing._\n\nIf you're searching for ${keyword}, you're already past the "is this a problem?" stage. The question is which approach actually works at the scale you operate at.\n\n## Why ${keyword} matters\n\nShort intro on the pain.\n\n## The three ways teams handle this today\n\n1. Manually, in code — slow, brittle, requires a redeploy.\n2. With a generic CMS — clunky, opinionated, doesn't fit.\n3. With a dedicated control plane — what we built.\n\n## What good looks like\n\nWhat the ideal workflow feels like.\n\n## How Partners in Biz approaches it\n\nA short walkthrough of the relevant Properties feature, written in our voice.${cta}`
}

/**
 * Generate a full blog post body in Markdown for a given title + target keyword.
 * ~1200–1800 words. Falls back to a deterministic outline if the AI call fails.
 *
 * Voice + format are tuned for the Partners in Biz brand: founder-direct, no fluff,
 * SA-English spelling, specific over generic. The Properties launch tagline strategy
 * is honoured — the master tagline is hinted at but not forced into every post.
 */
export async function generateBlogDraft(opts: {
  title: string
  keyword: string
  targetUrl?: string
  type?: string
}): Promise<BlogDraft> {
  const { title, keyword, targetUrl, type = 'how-to' } = opts

  try {
    const { text } = await generateText({
      model: DRAFT_MODEL,
      system:
        'You are a senior copywriter for Partners in Biz, a South African client-growth platform. ' +
        'You write founder-direct, specific, no-fluff blog posts in British/SA English. ' +
        'Output VALID Markdown ONLY — no preamble, no explanations, no code fences around the whole document. ' +
        'Structure: a single H1 (the title), a punchy 2–3 sentence intro hook, 4–6 H2 sections with substantive prose under each, and a closing H2 with a clear next-step CTA. ' +
        'Length: 1200–1800 words. Use the target keyword naturally in the H1, the first paragraph, at least two H2s, and the conclusion. ' +
        'Do NOT use buzzwords like "leverage", "synergy", "unlock", "supercharge", or "in today\'s fast-paced world". ' +
        'Cite real specifics (numbers, examples, named tools) over generic claims. When you reference Partners in Biz Properties, link it naturally to the targetUrl if provided.',
      prompt:
        `Title: ${title}\n` +
        `Target keyword: ${keyword}\n` +
        `Content type: ${type}\n` +
        (targetUrl ? `Internal target URL: ${targetUrl}\n` : '') +
        `\nWrite the full Markdown blog post now.`,
      maxOutputTokens: 4000,
    })

    const body = text.trim()
    const wordCount = body.split(/\s+/).filter(Boolean).length

    if (wordCount >= 600 && body.includes('#')) {
      // Pull a meta description from the first paragraph after the H1
      const firstPara =
        body
          .split('\n')
          .find((l) => l.trim().length > 80 && !l.startsWith('#'))
          ?.trim() ?? ''
      const metaDescription =
        firstPara.length > 160 ? firstPara.slice(0, 157).trimEnd() + '…' : firstPara

      return { title, metaDescription, body, wordCount, generatedBy: 'ai' }
    }
  } catch {
    // AI unavailable — fall through
  }

  const body = templateBlogBody(title, keyword, targetUrl)
  return {
    title,
    metaDescription: `${title} — a Partners in Biz guide on ${keyword}.`.slice(0, 160),
    body,
    wordCount: body.split(/\s+/).filter(Boolean).length,
    generatedBy: 'template',
  }
}
