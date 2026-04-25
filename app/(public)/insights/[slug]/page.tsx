import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import { POSTS, getPostBySlug, type Post } from '@/lib/content/posts'
import { SITE } from '@/lib/seo/site'
import { JsonLd, articleSchema, breadcrumbSchema } from '@/lib/seo/schema'
import { Reveal } from '@/components/marketing/Reveal'

interface Params { params: Promise<{ slug: string }> }

export function generateStaticParams() {
  return POSTS.map((p) => ({ slug: p.slug }))
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params
  const post = getPostBySlug(slug)
  if (!post) return { title: 'Post not found' }
  const url = `${SITE.url}/insights/${post.slug}`
  return {
    title: post.title,
    description: post.description,
    alternates: { canonical: `/insights/${post.slug}` },
    openGraph: {
      title: post.title,
      description: post.description,
      url,
      type: 'article',
      publishedTime: post.datePublished,
      modifiedTime: post.dateModified ?? post.datePublished,
      images: [{ url: `${SITE.url}${post.cover}` }],
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.description,
      images: [`${SITE.url}${post.cover}`],
    },
  }
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-ZA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function renderBody(body: string) {
  const lines = body.split('\n')
  const out: React.ReactNode[] = []
  lines.forEach((raw, idx) => {
    const line = raw.trim()
    if (!line) return
    if (line.startsWith('## ')) {
      out.push(
        <h2
          key={idx}
          className="font-display text-3xl md:text-4xl text-[var(--color-pib-text)] mt-12 mb-4 text-balance"
        >
          {line.slice(3)}
        </h2>
      )
    } else if (line.startsWith('# ')) {
      out.push(
        <h1
          key={idx}
          className="font-display text-4xl text-[var(--color-pib-text)] mt-12 mb-4 text-balance"
        >
          {line.slice(2)}
        </h1>
      )
    } else {
      out.push(
        <p
          key={idx}
          className="text-lg leading-relaxed text-[var(--color-pib-text-muted)] my-6 text-pretty"
        >
          {line}
        </p>
      )
    }
  })
  return out
}

export default async function InsightPostPage({ params }: Params) {
  const { slug } = await params
  const post = getPostBySlug(slug)
  if (!post) notFound()

  const breadcrumb = breadcrumbSchema([
    { name: 'Home', url: '/' },
    { name: 'Insights', url: '/insights' },
    { name: post.title, url: `/insights/${post.slug}` },
  ])
  const article = articleSchema({
    slug: `insights/${post.slug}`,
    title: post.title,
    description: post.description,
    image: post.cover,
    datePublished: post.datePublished,
    dateModified: post.dateModified,
    section: post.category,
  })

  const related = POSTS.filter((p) => p.slug !== post.slug).slice(0, 2)

  return (
    <main className="relative">
      <JsonLd data={breadcrumb} />
      <JsonLd data={article} />

      <article className="section">
        <div className="container-pib">
          <div className="max-w-3xl mx-auto">
            {/* Back */}
            <Reveal>
              <Link
                href="/insights"
                className="inline-flex items-center gap-2 text-sm text-[var(--color-pib-text-muted)] hover:text-[var(--color-pib-accent)] transition mb-10"
              >
                <span className="material-symbols-outlined text-base">arrow_back</span>
                All insights
              </Link>
            </Reveal>

            <Reveal delay={80}>
              <div className="flex flex-wrap gap-2 mb-6">
                <span className="pill pill-accent">{post.category}</span>
                {post.tags.map((t) => (
                  <span key={t} className="pill">
                    {t}
                  </span>
                ))}
              </div>
            </Reveal>

            <Reveal delay={120}>
              <h1 className="h-display text-balance">{post.title}</h1>
            </Reveal>

            <Reveal delay={180}>
              <p className="mt-6 text-xl text-[var(--color-pib-text-muted)] text-pretty leading-relaxed">
                {post.description}
              </p>
            </Reveal>

            {/* Byline */}
            <Reveal delay={240}>
              <div className="mt-8 flex items-center gap-3 pb-8 border-b border-[var(--color-pib-line)]">
                <div className="w-10 h-10 rounded-full bg-[var(--color-pib-accent)] text-black font-display text-lg grid place-items-center shrink-0">
                  P
                </div>
                <div className="text-sm text-[var(--color-pib-text-muted)]">
                  By <span className="text-[var(--color-pib-text)]">{SITE.founder.name}</span>{' '}
                  · Published {fmtDate(post.datePublished)} · {post.readingTime}
                </div>
              </div>
            </Reveal>
          </div>

          {/* Cover */}
          <Reveal delay={300}>
            <div className="max-w-4xl mx-auto mt-12 relative aspect-[16/9] rounded-2xl overflow-hidden border border-[var(--color-pib-line)]">
              <Image
                src={post.cover}
                alt={post.title}
                width={1600}
                height={900}
                className="absolute inset-0 w-full h-full object-cover"
                priority
              />
            </div>
          </Reveal>

          {/* Body */}
          <div className="max-w-3xl mx-auto mt-16">{renderBody(post.body)}</div>

          {/* Author bio */}
          <div className="max-w-3xl mx-auto mt-20">
            <div className="bento-card p-8 flex items-start gap-5">
              <div className="w-14 h-14 rounded-full bg-[var(--color-pib-accent)] text-black font-display text-2xl grid place-items-center shrink-0">
                P
              </div>
              <div className="flex-1">
                <h3 className="font-display text-xl text-[var(--color-pib-text)]">
                  {SITE.founder.name}
                </h3>
                <p className="text-sm text-[var(--color-pib-text-muted)] mt-1">
                  {SITE.founder.role}
                </p>
                <p className="mt-3 text-[var(--color-pib-text-muted)] leading-relaxed text-pretty">
                  Writes the build notes, ships the code, answers the email. Based in Cape Town,
                  working with clients globally.
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Link href="/insights#newsletter" className="btn-pib-secondary text-sm">
                    Subscribe
                  </Link>
                  <Link href="/about" className="btn-pib-secondary text-sm">
                    About PiB
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* Related */}
          {related.length > 0 && (
            <div className="max-w-5xl mx-auto mt-20">
              <p className="eyebrow mb-6">Related reads</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6">
                {related.map((r: Post) => (
                  <Link
                    key={r.slug}
                    href={`/insights/${r.slug}`}
                    className="bento-card p-6 group"
                  >
                    <span className="pill mb-4 inline-flex">{r.category}</span>
                    <h4 className="font-display text-xl text-[var(--color-pib-text)] text-balance group-hover:text-[var(--color-pib-accent)] transition">
                      {r.title}
                    </h4>
                    <p className="mt-2 text-sm text-[var(--color-pib-text-muted)] line-clamp-2">
                      {r.description}
                    </p>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* CTA */}
          <div className="max-w-5xl mx-auto mt-20">
            <div className="bento-card p-10 md:p-14 flex flex-col md:flex-row md:items-center justify-between gap-8">
              <div className="max-w-xl">
                <p className="eyebrow mb-3">Got a project?</p>
                <h3 className="h-display text-3xl md:text-4xl text-balance">
                  Let&rsquo;s build the next one together.
                </h3>
              </div>
              <Link href="/start-a-project" className="btn-pib-accent shrink-0">
                Start a project
                <span className="material-symbols-outlined text-base">arrow_outward</span>
              </Link>
            </div>
          </div>
        </div>
      </article>
    </main>
  )
}
