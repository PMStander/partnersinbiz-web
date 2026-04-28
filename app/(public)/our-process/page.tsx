import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { SITE, PROCESS } from '@/lib/seo/site'
import { JsonLd, breadcrumbSchema, faqSchema } from '@/lib/seo/schema'
import { Reveal } from '@/components/marketing/Reveal'
import { FAQ } from '@/components/marketing/FAQ'

export const metadata: Metadata = {
  title: 'Process — How we ship software in weeks, not quarters',
  description:
    'The exact process we use to ship websites, web apps, and AI integrations. Five phases, real artifacts, no theatre.',
  alternates: { canonical: '/our-process' },
  openGraph: {
    title: 'Our process | Partners in Biz',
    description:
      'Discover, Design, Build, Launch, Grow. Five phases. Real artifacts. Weekly Loom updates. Linear board you can read.',
    url: `${SITE.url}/our-process`,
    type: 'article',
  },
}

const ARTIFACTS: Record<string, { label: string; image: string; tint: string }> = {
  Discover: { label: 'Sample audit deck', image: '/images/process-discover.jpg', tint: 'from-amber-500/20' },
  Design: { label: 'Figma file thumbnail', image: '/images/process-design.jpg', tint: 'from-violet-500/20' },
  Build: { label: 'Linear board screenshot', image: '/images/process-build.jpg', tint: 'from-emerald-500/20' },
  Launch: { label: 'Vercel deployment log', image: '/images/process-launch.jpg', tint: 'from-sky-500/20' },
  Grow: { label: 'Analytics dashboard', image: '/images/process-grow.jpg', tint: 'from-rose-500/20' },
}

const TOOLS = [
  'Figma', 'Linear', 'GitHub', 'Vercel', 'Sanity', 'Notion', 'Loom', 'Cal.com', 'Slack', 'WhatsApp',
] as const

const TIMELINES = [
  {
    type: 'Marketing site',
    range: '2–4 weeks',
    notes: 'Length depends on copy readiness, page count (5 vs 20), and CMS needs.',
  },
  {
    type: 'Web app MVP',
    range: '6–12 weeks',
    notes: 'Auth, data model complexity, third-party integrations, and admin tooling drive scope.',
  },
  {
    type: 'Mobile app v1',
    range: '8–16 weeks',
    notes: 'Single-platform vs cross-platform, native modules, and store-review cycles.',
  },
  {
    type: 'AI integration',
    range: '2–6 weeks',
    notes: 'Depends on whether it\'s a feature inside an existing product, or a net-new agent with tools and memory.',
  },
] as const

const WEEKLY = [
  { icon: 'videocam', title: 'Weekly Loom video', body: 'A 5-10 min walkthrough of what shipped and what\'s next.' },
  { icon: 'view_kanban', title: 'Linear board you can read', body: 'No private project. You see every ticket, status, and blocker.' },
  { icon: 'cloud_done', title: 'Vercel preview URLs', body: 'Every pull request gets a live URL. Comment, screenshot, share.' },
  { icon: 'forum', title: 'WhatsApp + Slack channel', body: 'For the things that don\'t need a meeting. Replies same business day.' },
] as const

const PROCESS_FAQ = [
  {
    q: 'What if I want to change scope mid-build?',
    a: 'Expected — most projects do. Small changes (under ~4 hours) we just absorb. Anything bigger gets a one-line change order with a price and timeline impact, sent via WhatsApp before we touch it. You approve, we build.',
  },
  {
    q: 'Do I need to know exactly what I want?',
    a: 'No. The Discover phase exists for that reason — two weeks where we map your business, your customers, and the wedge before writing code. If you arrive with a brief, great. If you arrive with a problem, we shape the brief together.',
  },
  {
    q: 'Can I bring in my own designer?',
    a: 'Yes. We work with external designers regularly — we\'ll set up the Figma → Linear → GitHub pipeline so the handover is clean. If you don\'t have one, we have a small bench of designers we trust and partner with.',
  },
  {
    q: 'What does a typical week look like?',
    a: 'Monday: brief check-in (15 min). Wed/Thu: deep work and PRs. Friday: Loom video update with what shipped, what\'s next, and any decisions we need from you. Anything urgent goes via WhatsApp in real-time.',
  },
  {
    q: 'What happens if you get hit by a bus?',
    a: 'Everything is in your GitHub, your Vercel, and your Firebase from day one. Documentation lives in your repo. We use boring, mainstream tooling specifically so any other competent engineer can pick it up. We also have a documented handover process for that exact scenario.',
  },
  {
    q: 'How do payments work?',
    a: 'EFT-first. South African clients: 50% on signature, 50% on launch. International clients: same split, paid via PayPal or international card if EFT isn\'t practical. Retainers are billed monthly in advance. Every invoice has the banking details right on it.',
  },
] as const

export default function OurProcessPage() {
  const breadcrumbs = breadcrumbSchema([
    { name: 'Home', url: '/' },
    { name: 'Process', url: '/our-process' },
  ])
  const faq = faqSchema([...PROCESS_FAQ])

  return (
    <main className="bg-[var(--color-pib-bg)] text-[var(--color-pib-text)]">
      <JsonLd data={breadcrumbs} />
      <JsonLd data={faq} />

      {/* HERO */}
      <section className="relative pt-32 md:pt-44 pb-20 md:pb-28 overflow-hidden">
        <div className="absolute inset-0 pib-mesh pointer-events-none" aria-hidden />
        <div className="absolute inset-0 pib-grid-bg pointer-events-none opacity-60" aria-hidden />
        <div className="container-pib relative">
          <Reveal>
            <p className="eyebrow mb-6">Process</p>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="h-display text-balance max-w-5xl">
              We don&apos;t sell hours. We sell shipped software.
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="mt-8 text-lg md:text-xl text-[var(--color-pib-text-muted)] max-w-2xl text-pretty leading-relaxed">
              Five phases, real artifacts, no theatre. This is the exact process we use on every
              engagement — from the first discovery call to the third month of post-launch growth.
            </p>
          </Reveal>
          <Reveal delay={240}>
            <div className="mt-10 flex flex-wrap items-center gap-3">
              <Link href="/start-a-project" className="btn-pib-primary">
                Start a project
                <span className="material-symbols-outlined text-base">arrow_outward</span>
              </Link>
              <Link href={SITE.cal.url} className="btn-pib-secondary">
                Book a 20-min intro
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* PROCESS TIMELINE */}
      <section className="section border-t border-[var(--color-pib-line)]">
        <div className="container-pib">
          <div className="max-w-3xl mb-16 md:mb-20">
            <Reveal>
              <p className="eyebrow mb-5">The five phases</p>
            </Reveal>
            <Reveal delay={80}>
              <h2 className="h-display text-balance">
                What you actually get, week by week.
              </h2>
            </Reveal>
          </div>

          <ol className="space-y-px bg-[var(--color-pib-line)] border border-[var(--color-pib-line)] rounded-[20px] overflow-hidden">
            {PROCESS.map((phase, i) => {
              const artifact = ARTIFACTS[phase.name]
              const isLast = i === PROCESS.length - 1
              return (
                <Reveal key={phase.step} as="li" delay={i * 60}>
                  <article className="bg-[var(--color-pib-bg)] grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 p-8 md:p-12 lg:p-14">
                    {/* Number + name */}
                    <div className="lg:col-span-3">
                      <div className="font-display text-7xl md:text-8xl text-[var(--color-pib-accent)] leading-none">
                        {phase.step}
                      </div>
                      <h3 className="mt-4 font-display text-3xl md:text-4xl">{phase.name}</h3>
                      {!isLast && (
                        <div className="hidden lg:block mt-8 text-xs uppercase tracking-wider font-mono text-[var(--color-pib-text-faint)]">
                          ↓ next: {PROCESS[i + 1].name}
                        </div>
                      )}
                    </div>

                    {/* Blurb + deliverables */}
                    <div className="lg:col-span-5">
                      <p className="text-lg text-[var(--color-pib-text-muted)] leading-relaxed text-pretty max-w-md">
                        {phase.blurb}
                      </p>
                      <div className="mt-7">
                        <p className="eyebrow mb-3">Deliverables</p>
                        <ul className="space-y-2">
                          {phase.deliverables.map((d) => (
                            <li key={d} className="flex items-start gap-3 text-[var(--color-pib-text)]">
                              <span className="material-symbols-outlined text-base text-[var(--color-pib-accent)] mt-0.5">check</span>
                              <span className="text-sm md:text-base">{d}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    {/* Artifact */}
                    <div className="lg:col-span-4">
                      <div className="bento-card p-3 h-full flex flex-col">
                        <div className="relative aspect-[4/3] overflow-hidden rounded-[12px] border border-[var(--color-pib-line)] bg-[var(--color-pib-surface-2)]">
                          <Image
                            src={artifact.image}
                            alt={artifact.label}
                            fill
                            sizes="(max-width: 1024px) 100vw, 33vw"
                            className="object-cover opacity-70"
                          />
                          <div className={`absolute inset-0 bg-gradient-to-br ${artifact.tint} via-transparent to-transparent`} />
                          <div className="absolute top-3 left-3">
                            <span className="pill text-[10px]">Artifact</span>
                          </div>
                        </div>
                        <div className="px-3 pt-4 pb-2 flex items-center justify-between">
                          <p className="font-mono text-xs uppercase tracking-wider text-[var(--color-pib-text-muted)]">
                            {artifact.label}
                          </p>
                          <Link href="#" className="pib-link-underline text-xs font-medium text-[var(--color-pib-accent)]">
                            View example →
                          </Link>
                        </div>
                      </div>
                    </div>
                  </article>
                </Reveal>
              )
            })}
          </ol>
        </div>
      </section>

      {/* TOOLS */}
      <section className="section border-t border-[var(--color-pib-line)] bg-[var(--color-pib-surface)]/30">
        <div className="container-pib grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16 items-start">
          <div className="lg:col-span-5">
            <Reveal>
              <p className="eyebrow mb-5">Tools we work in</p>
            </Reveal>
            <Reveal delay={80}>
              <h2 className="h-display text-balance">
                Where the work happens.
              </h2>
            </Reveal>
            <Reveal delay={160}>
              <p className="mt-6 text-lg text-[var(--color-pib-text-muted)] leading-relaxed text-pretty max-w-md">
                You&apos;ll get invited to the boards, the channels, the previews. Nothing
                lives in a black box.
              </p>
            </Reveal>
          </div>
          <div className="lg:col-span-7">
            <Reveal delay={120}>
              <div className="flex flex-wrap gap-2.5">
                {TOOLS.map((tool) => (
                  <span key={tool} className="pill text-sm px-4 py-2">
                    {tool}
                  </span>
                ))}
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* TIMELINES */}
      <section className="section border-t border-[var(--color-pib-line)]">
        <div className="container-pib">
          <div className="max-w-3xl mb-14">
            <Reveal>
              <p className="eyebrow mb-5">Timelines</p>
            </Reveal>
            <Reveal delay={80}>
              <h2 className="h-display text-balance">
                How long it actually takes.
              </h2>
            </Reveal>
            <Reveal delay={160}>
              <p className="mt-6 text-lg text-[var(--color-pib-text-muted)] leading-relaxed text-pretty">
                Real ranges, not sales-call optimism. The number depends on a few variables
                we&apos;ll work out in the discovery call.
              </p>
            </Reveal>
          </div>

          <div className="border border-[var(--color-pib-line)] rounded-[20px] overflow-hidden divide-y divide-[var(--color-pib-line)]">
            <div className="hidden md:grid grid-cols-12 gap-6 px-8 py-5 bg-[var(--color-pib-surface)]/50">
              <p className="col-span-3 eyebrow">Engagement</p>
              <p className="col-span-2 eyebrow">Range</p>
              <p className="col-span-7 eyebrow">What affects it</p>
            </div>
            {TIMELINES.map((row, i) => (
              <Reveal key={row.type} delay={i * 50}>
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 md:gap-6 px-6 md:px-8 py-7 hover:bg-[var(--color-pib-surface)]/40 transition-colors">
                  <div className="md:col-span-3">
                    <p className="font-display text-2xl leading-tight">{row.type}</p>
                  </div>
                  <div className="md:col-span-2">
                    <span className="pill pill-accent text-sm">{row.range}</span>
                  </div>
                  <p className="md:col-span-7 text-[var(--color-pib-text-muted)] leading-relaxed text-pretty">
                    {row.notes}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* WHAT YOU GET WEEKLY */}
      <section className="section border-t border-[var(--color-pib-line)] bg-[var(--color-pib-surface)]/30">
        <div className="container-pib">
          <div className="max-w-3xl mb-14">
            <Reveal>
              <p className="eyebrow mb-5">Every week, without asking</p>
            </Reveal>
            <Reveal delay={80}>
              <h2 className="h-display text-balance">
                What you get on the regular.
              </h2>
            </Reveal>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {WEEKLY.map((item, i) => (
              <Reveal key={item.title} delay={i * 60}>
                <div className="bento-card h-full">
                  <span className="material-symbols-outlined text-3xl text-[var(--color-pib-accent)] mb-6 block">
                    {item.icon}
                  </span>
                  <h3 className="font-display text-2xl leading-tight mb-3">{item.title}</h3>
                  <p className="text-[var(--color-pib-text-muted)] leading-relaxed text-sm text-pretty">
                    {item.body}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="section border-t border-[var(--color-pib-line)]">
        <div className="container-pib grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16 items-start">
          <div className="lg:col-span-4">
            <Reveal>
              <p className="eyebrow mb-5">FAQ</p>
            </Reveal>
            <Reveal delay={80}>
              <h2 className="h-display text-balance">
                Things people actually ask.
              </h2>
            </Reveal>
            <Reveal delay={160}>
              <p className="mt-6 text-[var(--color-pib-text-muted)] leading-relaxed text-pretty max-w-sm">
                Don&apos;t see your question?{' '}
                <Link href={`mailto:${SITE.email}`} className="pib-link-underline text-[var(--color-pib-text)]">
                  Email me directly
                </Link>
                .
              </p>
            </Reveal>
          </div>
          <div className="lg:col-span-8">
            <Reveal delay={120}>
              <FAQ items={PROCESS_FAQ} />
            </Reveal>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="section border-t border-[var(--color-pib-line)] relative overflow-hidden">
        <div className="absolute inset-0 pib-mesh pointer-events-none" aria-hidden />
        <div className="container-pib relative text-center">
          <Reveal>
            <p className="eyebrow mb-6">Ready when you are</p>
          </Reveal>
          <Reveal delay={80}>
            <h2 className="h-display text-balance max-w-4xl mx-auto">
              Let&apos;s ship something real.
            </h2>
          </Reveal>
          <Reveal delay={160}>
            <p className="mt-6 text-lg text-[var(--color-pib-text-muted)] max-w-xl mx-auto text-pretty">
              90 seconds to fill in the brief. One business day to a reply. Two weeks to a
              fixed-scope proposal.
            </p>
          </Reveal>
          <Reveal delay={240}>
            <div className="mt-10 flex flex-wrap justify-center items-center gap-3">
              <Link href="/start-a-project" className="btn-pib-accent">
                Start a project
                <span className="material-symbols-outlined text-base">arrow_outward</span>
              </Link>
              <Link href="/work" className="btn-pib-secondary">
                See past work
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </main>
  )
}
