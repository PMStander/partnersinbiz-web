// AI-generated SEO assets. Falls back to deterministic templates if no AI provider.

export function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

// For v1, generators return template-based candidates. AI integration can be wired
// later via the existing `ai` SDK; this keeps the module side-effect-free for tests.
export function generateTitleCandidates(topic: string, keyword: string): string[] {
  return [
    `${topic} | ${keyword} — A complete guide`,
    `The best ${keyword} for ${topic} (2026)`,
    `${keyword}: how to ${topic} the right way`,
    `${topic} with ${keyword} — what works in 2026`,
    `Why ${keyword} matters for ${topic}`,
  ].map((t) => (t.length > 60 ? t.slice(0, 57).trimEnd() + '…' : t))
}

export function generateMetaCandidates(topic: string, keyword: string): string[] {
  return [
    `Everything you need to know about ${keyword} for ${topic}. Practical guide with real examples.`,
    `${topic}? Here's how ${keyword} fits in — with checklists, mistakes to avoid, and what works in 2026.`,
    `Stop guessing about ${keyword}. This guide covers ${topic} step by step, with case studies and tools.`,
  ].map((d) => (d.length > 160 ? d.slice(0, 157).trimEnd() + '…' : d))
}
