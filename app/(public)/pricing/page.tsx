import type { Metadata } from 'next'
import Link from 'next/link'
import { SITE } from '@/lib/seo/site'
import { JsonLd, breadcrumbSchema, faqSchema } from '@/lib/seo/schema'
import { Reveal } from '@/components/marketing/Reveal'
import { SectionHead } from '@/components/marketing/SectionHead'
import { FAQ } from '@/components/marketing/FAQ'

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'Honest pricing in ZAR for marketing sites, web apps, and bespoke builds. Real numbers, no "let\'s talk" gatekeeping.',
  alternates: { canonical: '/pricing' },
  openGraph: {
    title: 'Pricing — Partners in Biz',
    description:
      'Honest pricing in ZAR for marketing sites, web apps, retainers, and add-ons.',
    url: `${SITE.url}/pricing`,
    type: 'website',
  },
}

const ZAR = (n: number) =>
  new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: 0,
  }).format(n)

interface Tier {
  name: string
  priceText: string
  priceAmount?: number
  tagline: string
  features: string[]
  cta: { label: string; href: string }
  popular?: boolean
}

const TIERS: Tier[] = [
  {
    name: 'Marketing Site',
    priceText: `from ${ZAR(35000)}`,
    priceAmount: 35000,
    tagline: 'Sub-2s LCP. Real lead capture. Built to be found.',
    features: [
      'Up to 8 pages',
      'Full SEO setup (schema + sitemap + llms.txt)',
      'Analytics + lead capture',
      'Vercel deploy + handover',
      '30-day warranty',
    ],
    cta: { label: 'Start a project', href: '/start-a-project' },
  },
  {
    name: 'Web Application',
    priceText: `from ${ZAR(120000)}`,
    priceAmount: 120000,
    tagline: 'Custom platforms shipped in weeks.',
    popular: true,
    features: [
      'Discovery sprint (2 weeks)',
      'Designed in Figma',
      'Production code on Vercel',
      'Auth + database + admin',
      'Daily Loom updates',
      'Launch checklist + handover',
      '60-day warranty',
    ],
    cta: { label: 'Start a project', href: '/start-a-project' },
  },
  {
    name: 'Bespoke Build',
    priceText: 'Let’s scope it',
    tagline: 'When the off-the-shelf answer is no.',
    features: [
      'Architecture review',
      'Long-form engagement',
      'Equity / retainer / fixed-scope options',
      'Direct access to Peet',
      'Quarterly business reviews',
    ],
    cta: { label: 'Book a call', href: SITE.cal.url },
  },
]

const RETAINERS = [
  {
    name: 'Lite',
    price: 15000,
    blurb: '8 hrs of dev + monitoring',
  },
  {
    name: 'Growth',
    price: 35000,
    blurb: '20 hrs + roadmap reviews + experiments',
  },
  {
    name: 'Embedded',
    price: 75000,
    blurb: '40 hrs + on-call + weekly meetings',
  },
]

const ADDONS = [
  { name: 'Performance audit', price: ZAR(8000), icon: 'speed' },
  { name: 'AI feature build-in', price: `from ${ZAR(25000)}`, icon: 'bolt' },
  { name: 'Brand identity', price: `from ${ZAR(18000)}`, icon: 'palette' },
  { name: 'SEO sprint', price: ZAR(12000), icon: 'travel_explore' },
  { name: 'Migration to modern stack', price: `from ${ZAR(28000)}`, icon: 'swap_horiz' },
]

const PRICING_FAQ = [
  {
    q: 'Why no Stripe?',
    a: 'For South African clients EFT is free, instant, and what businesses already use. Stripe adds 3.5% + R3 per txn for no benefit on a R120k invoice. PayPal handles international clients at the same 3.5%. We will integrate Stripe inside your product if you sell B2C — but not for invoicing us.',
  },
  {
    q: 'Are these starting prices?',
    a: 'Yes. The "from" number assumes a clean brief and standard scope. Most projects land between the start and 2x — we share a fixed-scope quote within 3 working days, so you never get a surprise.',
  },
  {
    q: 'What’s not included?',
    a: 'Hosting (Vercel ~$20/mo), database (Firebase / Supabase free or pay-as-you-go), and any third-party APIs you choose (Resend, Anthropic, etc.) are billed directly to your account — not marked up by us. Domain registration is on you.',
  },
  {
    q: 'Can we do equity / revenue-share?',
    a: 'For Bespoke Build engagements, yes. We take equity in roughly 1 in 5 projects. The bar is high: real founders, real traction signals, and a problem we want to solve. Equity is layered on a discounted cash rate, never instead of one.',
  },
  {
    q: 'What about ongoing hosting costs?',
    a: 'Most marketing sites run for under R500/month total infra. Web apps with auth and a database typically sit between R1k–R5k/month, scaling with usage. We design for cost from day one — no surprise R30k AWS bills.',
  },
  {
    q: 'Do you do payment plans?',
    a: 'Standard split is 40% to start, 30% at design sign-off, 30% at launch. For Bespoke Build we structure monthly milestones over the engagement length. International clients can pay via PayPal in USD/EUR at current FX.',
  },
]

export default function PricingPage() {
  const breadcrumb = breadcrumbSchema([
    { name: 'Home', url: '/' },
    { name: 'Pricing', url: '/pricing' },
  ])
  const faq = faqSchema(PRICING_FAQ)

  const offers = TIERS.filter((t) => t.priceAmount).map((t) => ({
    '@context': 'https://schema.org',
    '@type': 'Offer',
    name: t.name,
    description: t.tagline,
    url: `${SITE.url}/pricing`,
    priceCurrency: 'ZAR',
    price: t.priceAmount,
    priceSpecification: {
      '@type': 'PriceSpecification',
      minPrice: t.priceAmount,
      priceCurrency: 'ZAR',
    },
    availability: 'https://schema.org/InStock',
    seller: { '@id': `${SITE.url}/#organization` },
  }))

  return (
    <main className="relative">
      <JsonLd data={breadcrumb} />
      <JsonLd data={faq} />
      {offers.map((o, i) => (
        <JsonLd key={i} data={o} />
      ))}

      {/* Hero */}
      <section className="section relative overflow-hidden">
        <div className="pib-mesh absolute inset-0 -z-10 opacity-70" />
        <div className="container-pib">
          <Reveal>
            <p className="eyebrow mb-6">Pricing</p>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="h-display text-balance max-w-5xl">
              Honest numbers. No &ldquo;let&rsquo;s talk&rdquo; gatekeeping.
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="mt-8 max-w-2xl text-lg md:text-xl text-[var(--color-pib-text-muted)] text-pretty">
              Most projects fall into one of these three shapes. If yours doesn&rsquo;t, we&rsquo;ll
              scope it together — usually within 3 working days.
            </p>
          </Reveal>
        </div>
      </section>

      {/* Tiers */}
      <section className="section pt-0">
        <div className="container-pib">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 md:gap-6 items-stretch">
            {TIERS.map((t, i) => (
              <Reveal key={t.name} delay={i * 80}>
                <div
                  className={`bento-card h-full p-8 md:p-10 flex flex-col gap-6 relative ${
                    t.popular
                      ? 'border-[var(--color-pib-accent)] ring-1 ring-[var(--color-pib-accent)]'
                      : ''
                  }`}
                >
                  {t.popular && (
                    <span className="pill pill-accent absolute -top-3 left-8">Most popular</span>
                  )}

                  <div>
                    <h2 className="font-display text-2xl text-[var(--color-pib-text)]">
                      {t.name}
                    </h2>
                    <p className="mt-2 text-sm text-[var(--color-pib-text-muted)] text-pretty">
                      {t.tagline}
                    </p>
                  </div>

                  <div className="font-display text-4xl text-[var(--color-pib-text)]">
                    {t.priceText}
                  </div>

                  <ul className="space-y-3 flex-1 pt-4 border-t border-[var(--color-pib-line)]">
                    {t.features.map((f) => (
                      <li
                        key={f}
                        className="flex items-start gap-3 text-sm text-[var(--color-pib-text)]"
                      >
                        <span className="material-symbols-outlined text-base text-[var(--color-pib-accent)] mt-0.5 shrink-0">
                          check
                        </span>
                        <span className="text-pretty">{f}</span>
                      </li>
                    ))}
                  </ul>

                  {t.cta.href.startsWith('http') ? (
                    <a
                      href={t.cta.href}
                      target="_blank"
                      rel="noreferrer"
                      className={t.popular ? 'btn-pib-accent w-full justify-center' : 'btn-pib-secondary w-full justify-center'}
                    >
                      {t.cta.label}
                      <span className="material-symbols-outlined text-base">arrow_outward</span>
                    </a>
                  ) : (
                    <Link
                      href={t.cta.href}
                      className={t.popular ? 'btn-pib-accent w-full justify-center' : 'btn-pib-secondary w-full justify-center'}
                    >
                      {t.cta.label}
                      <span className="material-symbols-outlined text-base">arrow_forward</span>
                    </Link>
                  )}
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Retainers */}
      <section className="section pt-0">
        <div className="container-pib">
          <SectionHead
            eyebrow="Retainer"
            title="Already shipped? Keep growing."
            subtitle="Standing monthly engagements for product iteration, monitoring, growth experiments and the work that never quite fits a project shape."
          />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-6">
            {RETAINERS.map((r, i) => (
              <Reveal key={r.name} delay={i * 60}>
                <div className="bento-card h-full p-7 flex flex-col gap-4">
                  <h3 className="font-display text-xl text-[var(--color-pib-text)]">{r.name}</h3>
                  <div className="font-display text-3xl text-[var(--color-pib-accent)]">
                    {ZAR(r.price)}
                    <span className="text-sm text-[var(--color-pib-text-muted)] font-sans ml-1">
                      /month
                    </span>
                  </div>
                  <p className="text-sm text-[var(--color-pib-text-muted)] text-pretty">
                    {r.blurb}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Add-ons */}
      <section className="section pt-0">
        <div className="container-pib">
          <SectionHead
            eyebrow="Add-ons"
            title="One-off offerings."
            subtitle="Small, fixed-scope engagements you can drop into any project — or stand alone."
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {ADDONS.map((a, i) => (
              <Reveal key={a.name} delay={i * 50}>
                <div className="bento-card p-6 flex items-start gap-4">
                  <span
                    className="material-symbols-outlined text-[var(--color-pib-accent)] shrink-0"
                    style={{ fontSize: '28px' }}
                  >
                    {a.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-[var(--color-pib-text)]">{a.name}</h4>
                    <p className="text-sm font-mono text-[var(--color-pib-text-muted)] mt-1">
                      {a.price}
                    </p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Currency note */}
      <section className="pt-0 pb-10">
        <div className="container-pib">
          <Reveal>
            <div className="bento-card p-6 flex items-start gap-4">
              <span
                className="material-symbols-outlined text-[var(--color-pib-accent)] shrink-0"
                style={{ fontSize: '24px' }}
              >
                currency_exchange
              </span>
              <p className="text-sm text-[var(--color-pib-text-muted)] text-pretty">
                <span className="text-[var(--color-pib-text)]">Currencies.</span> Default ZAR.
                USD/EUR available on request. EFT preferred for SA clients (free); PayPal available
                for international (3.5%).
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* FAQ */}
      <section className="section">
        <div className="container-pib">
          <SectionHead
            eyebrow="Pricing FAQ"
            title="The questions every client asks."
            subtitle="If yours is not here, write to us — we answer every email."
          />
          <FAQ items={PRICING_FAQ} />
        </div>
      </section>

      {/* CTA */}
      <section className="section pt-0">
        <div className="container-pib">
          <Reveal>
            <div className="bento-card p-10 md:p-14 flex flex-col md:flex-row md:items-center justify-between gap-8">
              <div className="max-w-xl">
                <p className="eyebrow mb-3">Ready to start?</p>
                <h3 className="h-display text-3xl md:text-4xl text-balance">
                  Four questions. Ninety seconds.
                </h3>
                <p className="mt-4 text-[var(--color-pib-text-muted)] text-pretty">
                  Tell us what you&rsquo;re building. We reply within one business day.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 shrink-0">
                <Link href="/start-a-project" className="btn-pib-accent">
                  Start a project
                  <span className="material-symbols-outlined text-base">arrow_outward</span>
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
