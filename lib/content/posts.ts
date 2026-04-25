// Insights / blog post registry. Real posts replace placeholders over time.

export interface Post {
  slug: string
  title: string
  description: string
  category: 'Build Notes' | 'Case Studies' | 'Industry POV' | 'Tools'
  readingTime: string
  datePublished: string
  dateModified?: string
  cover: string
  tags: string[]
  body: string // Markdown — minimal templating for placeholders
}

export const POSTS: Post[] = [
  {
    slug: 'next-js-16-for-business-websites',
    title: 'Next.js 16 for business websites: what actually matters',
    description:
      'A practical look at the Next.js 16 features that move the needle for marketing sites and SaaS — and the ones you can ignore.',
    category: 'Build Notes',
    readingTime: '8 min',
    datePublished: '2026-04-12',
    dateModified: '2026-04-25',
    cover: '/images/our-process-hero.png',
    tags: ['Next.js', 'Performance', 'SEO'],
    body: `## TL;DR
Next.js 16 brings cache components, native View Transitions, and a smarter image pipeline. For business websites, the headline is faster perceived performance with less code.

## What changed
Next.js 16 promotes Cache Components from experimental to stable, deprecates the \`priority\` prop on \`<Image>\` in favour of explicit \`preload\` + \`fetchPriority\`, and ships native View Transitions across route boundaries.

## What to do about it
Migrate your hero images, drop \`priority\`, lean on \`generateMetadata\` for per-page schema, and use Cache Components on anything that does not need to change per request.

## What to ignore
The "is React Server Components ready" debate. They are. Ship.

## Bottom line
If you are still on Pages Router or Next 14, the upgrade is overdue. If you are on Next 15, take a weekend.`,
  },
  {
    slug: 'building-an-ai-agent-that-bills',
    title: 'Building an AI agent that actually bills clients',
    description:
      'How we wired Claude into a South African EFT-first invoicing flow — with proof-of-payment, PayPal fallback, and zero hallucinations.',
    category: 'Build Notes',
    readingTime: '11 min',
    datePublished: '2026-04-02',
    cover: '/images/our-process-design.png',
    tags: ['AI', 'Claude', 'Billing', 'South Africa'],
    body: `## TL;DR
A functional invoicing agent is not "GPT writes a number". It is a tool-calling Claude that owns a state machine — draft, sent, viewed, proof uploaded, paid — with hard guardrails on every transition.

## The architecture
Claude orchestrates. The platform owns truth. EFT is the default rail; PayPal is the international fallback. No Stripe — South African banking does not need it for this lane.

## The hard parts
Idempotency on agent retries. Webhooks from Resend. Proof-of-payment uploads from WhatsApp. Audit trails that make sense to humans and machines.

## The result
A client sends one message. The system invoices, follows up, and reconciles — and a human reviews exceptions, not the happy path.`,
  },
  {
    slug: 'south-african-website-cost-2026',
    title: 'How much does a custom website cost in South Africa in 2026?',
    description:
      'Honest pricing for marketing sites, web apps, and AI features — with real ZAR ranges, what changes the number, and what is worth paying for.',
    category: 'Industry POV',
    readingTime: '9 min',
    datePublished: '2026-03-21',
    cover: '/images/portrait-2.png',
    tags: ['Pricing', 'South Africa', 'Strategy'],
    body: `## TL;DR
Marketing sites: R35k–R120k. Custom web apps: R120k–R450k+. The number is set by integrations, not pages.

## What you are actually paying for
You are paying for decisions, not pixels. Anyone can install a Next.js template. The cost is in choosing what to build, what to ignore, and what to wire to which API.

## What is worth paying more for
Performance budgets, real analytics from day one, accessible defaults, and an actual launch plan.

## What is not worth paying more for
A custom CMS for a site that needs eight pages updated twice a year. Use Sanity. Move on.`,
  },
]

export function getPostBySlug(slug: string): Post | null {
  return POSTS.find((p) => p.slug === slug) ?? null
}
