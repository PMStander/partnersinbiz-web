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
import { BRIEF_MODEL } from '@/lib/ai/client'

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
