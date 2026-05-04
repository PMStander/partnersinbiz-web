import type { Metadata } from 'next'
import { SITE } from '@/lib/seo/site'
import BookingWidget from './BookingWidget'

export const metadata: Metadata = {
  title: 'Book a 20-min Intro Call | Partners in Biz',
  description: 'Pick a time and book a free 20-minute intro call with Peet at Partners in Biz.',
  alternates: { canonical: '/book-a-call' },
  openGraph: {
    title: 'Book a 20-min Intro Call | Partners in Biz',
    description: 'Pick a time and book a free 20-minute intro call with Peet at Partners in Biz.',
    url: `${SITE.url}/book-a-call`,
  },
}

export default function BookACallPage() {
  return (
    <main className="pt-28 pb-24 px-4">
      <div className="max-w-xl mx-auto space-y-8">
        <div className="space-y-3">
          <span className="eyebrow">Free intro call</span>
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
            Book a 20-min call
          </h1>
          <p className="text-[var(--color-pib-text-muted)] leading-relaxed">
            No sales pitch. We&rsquo;ll talk through what you&rsquo;re building, whether we&rsquo;re the right fit,
            and what a realistic scope and timeline looks like.
          </p>
        </div>

        <BookingWidget />

        <p className="text-xs text-[var(--color-pib-text-faint)] text-center">
          All times in SAST (UTC+2) · Mon–Fri · 09:00–17:00
        </p>
      </div>
    </main>
  )
}
