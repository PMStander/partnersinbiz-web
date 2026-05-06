import type { Metadata } from 'next'
import Link from 'next/link'
import { SITE } from '@/lib/seo/site'
import { JsonLd, breadcrumbSchema, faqSchema } from '@/lib/seo/schema'
import { Reveal } from '@/components/marketing/Reveal'
import { SectionHead } from '@/components/marketing/SectionHead'
import { FAQ } from '@/components/marketing/FAQ'

export const metadata: Metadata = {
  title: 'FAQ',
  description:
    'Answers to the most common questions about working with Partners in Biz — from scoping and pricing to timelines, tech stack, and what happens after launch.',
  alternates: { canonical: '/faq' },
  openGraph: {
    title: 'FAQ — Partners in Biz',
    description:
      'Common questions about working with Partners in Biz — pricing, process, tech stack, and more.',
    url: `${SITE.url}/faq`,
    type: 'website',
  },
}

const GENERAL_FAQ = [
  {
    q: 'Who is Partners in Biz for?',
    a: 'Ambitious South African SMEs that want software working for them — not against them. Our clients are typically founders, operators, and marketing leads who are done with generic agencies and want a technical partner that ships fast and thinks commercially.',
  },
  {
    q: 'What do you actually build?',
    a: 'Marketing websites, custom web applications, AI-powered tools, client portals, and growth automation. We also run 90-day SEO sprints and social media management for clients who want ongoing results alongside their tech.',
  },
  {
    q: 'Where are you based? Do you work remotely?',
    a: 'Remote-first, Pretoria-based. We work with clients across South Africa and internationally. Everything runs async — no need to be in the same city or timezone.',
  },
  {
    q: 'How is Partners in Biz different from a regular agency?',
    a: 'You get the founder in your corner — not a junior developer managed by an account handler. Every project is built by Peet (principal engineer) with a small, senior team. We keep client numbers intentionally low so quality stays high.',
  },
]

const PROCESS_FAQ = [
  {
    q: 'How does a project start?',
    a: 'Fill in the four-question brief on /start-a-project. We reply within one business day with questions or a scope draft. Fixed-scope quotes arrive within 3 working days. No discovery retainers, no surprise NDAs.',
  },
  {
    q: 'How long does a project take?',
    a: 'Marketing sites: 4–6 weeks. Web applications: 8–16 weeks depending on scope. We share a milestone-based timeline at kickoff so you always know what\'s being built and when.',
  },
  {
    q: 'Do you work on existing codebases?',
    a: 'Yes — we do audits, migrations, and feature work on existing projects. The first step is a code review to assess the health of the codebase and scope the work honestly.',
  },
  {
    q: 'What does your development process look like day to day?',
    a: 'Daily Loom updates on active projects. You see work-in-progress every 24 hours. Decisions get documented in writing. You\'re never waiting a week to hear what\'s happening.',
  },
  {
    q: 'Do you do design as well as development?',
    a: 'Yes. We design in Figma before we write a line of code. For marketing sites we work from your brand assets. For web apps we run a full design sprint and get sign-off before moving to build.',
  },
]

const TECH_FAQ = [
  {
    q: 'What\'s your tech stack?',
    a: 'Next.js (App Router) on Vercel, Firebase or Supabase for database and auth, Tailwind CSS, TypeScript throughout. For AI features we use the Anthropic API (Claude). We pick the right tool for the job — no religious attachment to any one framework.',
  },
  {
    q: 'Do you build mobile apps?',
    a: 'We build mobile-first web apps that work beautifully on any device. Native iOS/Android is not our core offering, but we have delivered Capacitor-wrapped web apps for clients who need app store presence without a separate native codebase.',
  },
  {
    q: 'Who hosts the site after launch?',
    a: 'Vercel for the application, Firebase or Supabase for the database — all on your accounts, not ours. You own the infrastructure. Most marketing sites cost under R500/month to run. We help you set everything up and hand over access cleanly.',
  },
  {
    q: 'Do you handle SEO?',
    a: 'Yes — every marketing site ships with full technical SEO: schema markup, sitemap, llms.txt, and meta setup. For clients who want ongoing SEO work, our 90-day sprint programme targets specific keywords and tracks position improvements monthly.',
  },
]

const PRICING_FAQ = [
  {
    q: 'What does it cost?',
    a: 'Marketing sites from R35,000. Web applications from R120,000. Retainers from R15,000/month. Add-ons (SEO sprint, performance audit, AI feature, brand identity) are fixed-scope and priced on the /pricing page. No hidden costs.',
  },
  {
    q: 'How do payment terms work?',
    a: 'Standard split: 40% to start, 30% at design sign-off, 30% at launch. For longer engagements we structure monthly milestones. EFT for SA clients (no fees). PayPal for international clients (3.5%).',
  },
  {
    q: 'Do you offer retainers?',
    a: 'Yes. Lite (R15k/month, 8 hrs), Growth (R35k/month, 20 hrs + roadmap reviews), and Embedded (R75k/month, 40 hrs + on-call). Retainers are month-to-month with 30 days notice.',
  },
  {
    q: 'Can we do equity or revenue share?',
    a: 'For bespoke engagements, yes. We take equity in roughly 1 in 5 projects. The bar is high: real founders, real traction, and a problem we want to solve. Equity layers on top of a discounted cash rate.',
  },
]

const ALL_SECTIONS = [
  { eyebrow: 'General', title: 'The basics.', items: GENERAL_FAQ },
  { eyebrow: 'Process', title: 'How we work.', items: PROCESS_FAQ },
  { eyebrow: 'Technology', title: 'What we build with.', items: TECH_FAQ },
  { eyebrow: 'Pricing', title: 'What it costs.', items: PRICING_FAQ },
]

const ALL_FAQ = [...GENERAL_FAQ, ...PROCESS_FAQ, ...TECH_FAQ, ...PRICING_FAQ]

export default function FaqPage() {
  const breadcrumb = breadcrumbSchema([
    { name: 'Home', url: '/' },
    { name: 'FAQ', url: '/faq' },
  ])
  const faq = faqSchema(ALL_FAQ)

  return (
    <main className="relative">
      <JsonLd data={breadcrumb} />
      <JsonLd data={faq} />

      {/* Hero */}
      <section className="section relative overflow-hidden">
        <div className="pib-mesh absolute inset-0 -z-10 opacity-70" />
        <div className="container-pib">
          <Reveal>
            <p className="eyebrow mb-6">FAQ</p>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="h-display text-balance max-w-4xl">
              Questions we get asked a lot.
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="mt-8 max-w-2xl text-lg md:text-xl text-[var(--color-pib-text-muted)] text-pretty">
              Straight answers — no sales speak. If yours isn&rsquo;t here, email us at{' '}
              <a
                href={`mailto:${SITE.email}`}
                className="text-[var(--color-pib-accent)] hover:underline"
              >
                {SITE.email}
              </a>
              .
            </p>
          </Reveal>
        </div>
      </section>

      {/* FAQ sections */}
      {ALL_SECTIONS.map((section) => (
        <section key={section.eyebrow} className="section pt-0">
          <div className="container-pib">
            <SectionHead eyebrow={section.eyebrow} title={section.title} />
            <FAQ items={section.items} />
          </div>
        </section>
      ))}

      {/* CTA */}
      <section className="section pt-0">
        <div className="container-pib">
          <Reveal>
            <div className="bento-card p-10 md:p-14 flex flex-col md:flex-row md:items-center justify-between gap-8">
              <div className="max-w-xl">
                <p className="eyebrow mb-3">Still have questions?</p>
                <h3 className="h-display text-3xl md:text-4xl text-balance">
                  Let&rsquo;s talk it through.
                </h3>
                <p className="mt-4 text-[var(--color-pib-text-muted)] text-pretty">
                  Tell us what you&rsquo;re building and we&rsquo;ll tell you honestly if we&rsquo;re the right fit.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 shrink-0">
                <Link href="/start-a-project" className="btn-pib-accent">
                  Start a project
                  <span className="material-symbols-outlined text-base">arrow_forward</span>
                </Link>
                <a
                  href={SITE.cal.url}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-pib-secondary"
                >
                  Book a call
                </a>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </main>
  )
}
