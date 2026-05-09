'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { BlogReaderCard } from '@/components/campaign-preview'
import { OrgThemedFrame, useOrgBrand } from '@/components/admin/OrgThemedFrame'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = any

interface Comment {
  id: string
  text: string
  userId: string
  userName: string
  userRole: 'admin' | 'client' | 'ai'
  createdAt: AnyObj
}

export default function BlogDetailPage() {
  const params = useParams()
  const slug = params?.slug as string
  const id = params?.id as string
  const blogId = params?.blogId as string
  const [orgId, setOrgId] = useState<string | null>(null)
  const [orgName, setOrgName] = useState('')

  useEffect(() => {
    fetch('/api/v1/organizations')
      .then(r => r.json())
      .then(body => {
        const org = (body.data ?? []).find((o: AnyObj) => o.slug === slug)
        if (org) {
          setOrgId(org.id)
          setOrgName(org.name)
        }
      })
      .catch(() => {})
  }, [slug])

  return (
    <OrgThemedFrame orgId={orgId} className="-m-6 p-6 min-h-screen">
      <Detail slug={slug} id={id} blogId={blogId} orgName={orgName} />
    </OrgThemedFrame>
  )
}

function Detail({
  slug,
  id,
  blogId,
  orgName,
}: {
  slug: string
  id: string
  blogId: string
  orgName: string
}) {
  const router = useRouter()
  const { brand } = useOrgBrand()
  const [blog, setBlog] = useState<AnyObj | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<null | 'approve' | 'reject'>(null)
  const [feedbackText, setFeedbackText] = useState('')
  const [showFeedback, setShowFeedback] = useState(false)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetch(`/api/v1/campaigns/${id}/assets`).then(r => r.json()),
      fetch(`/api/v1/seo/content/${blogId}/comments`).then(r => r.json()),
    ])
      .then(([a, c]) => {
        const blogs = (a.data?.blogs ?? []) as AnyObj[]
        setBlog(blogs.find(b => b.id === blogId) ?? null)
        setComments((c.data ?? []) as Comment[])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [id, blogId])

  const previewBlog = useMemo(() => {
    if (!blog) return null
    return {
      id: blog.id,
      title: blog.title ?? 'Untitled',
      type: blog.type,
      publishDate: blog.publishDate,
      targetUrl: blog.targetUrl,
      status: blog.status,
      draft: {
        body: blog.draft?.body,
        metaDescription: blog.draft?.metaDescription,
        wordCount: blog.draft?.wordCount,
      },
      heroImageUrl: blog.heroImageUrl,
      authorName: blog.authorName,
      authorAvatarUrl: blog.authorAvatarUrl,
      readTimeMinutes: blog.readTimeMinutes,
    }
  }, [blog])

  async function approve() {
    if (busy) return
    setBusy('approve')
    try {
      const r = await fetch(`/api/v1/seo/content/${blogId}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!r.ok) throw new Error('publish failed')
      router.refresh()
      router.push(`/admin/org/${slug}/social/${id}?tab=blogs`)
    } finally {
      setBusy(null)
    }
  }

  async function requestChanges() {
    if (busy || !feedbackText.trim()) return
    setBusy('reject')
    try {
      const r = await fetch(`/api/v1/seo/content/${blogId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: feedbackText.trim() }),
      })
      if (!r.ok) throw new Error('comment failed')
      // Re-pull comments
      const c = await fetch(`/api/v1/seo/content/${blogId}/comments`).then(r => r.json())
      setComments((c.data ?? []) as Comment[])
      setFeedbackText('')
      setShowFeedback(false)
    } finally {
      setBusy(null)
    }
  }

  if (loading) {
    return <div className="pib-skeleton h-96 max-w-4xl mx-auto rounded-2xl" />
  }

  if (!previewBlog) {
    return (
      <div className="pib-card max-w-4xl mx-auto p-10 text-center">
        <p className="text-sm text-on-surface-variant">Blog post not found.</p>
        <Link
          href={`/admin/org/${slug}/social/${id}?tab=blogs`}
          className="text-xs underline mt-2 inline-block"
        >
          ← Back to Blog Posts
        </Link>
      </div>
    )
  }

  const isPublished = blog?.status === 'live' || blog?.status === 'published'

  return (
    <div className="space-y-8 max-w-4xl mx-auto" style={{ color: 'var(--org-text, var(--color-pib-text))' }}>
      {/* Header */}
      <header className="space-y-2">
        <Link
          href={`/admin/org/${slug}/social/${id}?tab=blogs`}
          className="text-xs text-on-surface-variant hover:text-on-surface inline-flex items-center gap-1"
        >
          ← {orgName ? `${orgName} · Blog Posts` : 'Blog Posts'}
        </Link>
        <p
          className="text-[10px] font-label uppercase tracking-[0.2em]"
          style={{ color: 'var(--org-accent, var(--color-pib-accent))' }}
        >
          Blog Post · {isPublished ? 'Published' : 'Awaiting Review'}
        </p>
      </header>

      {/* The full blog reader */}
      <BlogReaderCard blog={previewBlog} brand={brand} />

      {/* Approval bar */}
      {!isPublished && (
        <section className="pib-card sticky bottom-4 p-5 flex flex-wrap items-center justify-between gap-3 backdrop-blur-md">
          <div>
            <p className="text-sm font-headline font-semibold">Ready to ship?</p>
            <p className="text-xs text-on-surface-variant">
              Approve to publish, or leave feedback to send it back.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowFeedback(v => !v)}
              disabled={!!busy}
              className="text-sm font-label px-4 py-2 rounded-md border border-[var(--org-border,var(--color-pib-line))] hover:bg-[var(--color-surface)] transition-colors disabled:opacity-50"
            >
              Request changes
            </button>
            <button
              type="button"
              onClick={approve}
              disabled={!!busy}
              className="text-sm font-label px-5 py-2 rounded-md transition-opacity disabled:opacity-50"
              style={{
                background: 'var(--org-accent, var(--color-pib-accent))',
                color: '#000',
              }}
            >
              {busy === 'approve' ? 'Publishing…' : 'Approve & publish'}
            </button>
          </div>
        </section>
      )}

      {/* Feedback panel */}
      {showFeedback && !isPublished && (
        <section className="pib-card p-5 space-y-3">
          <p className="text-xs font-label uppercase tracking-widest text-on-surface-variant">
            Request changes
          </p>
          <textarea
            value={feedbackText}
            onChange={e => setFeedbackText(e.target.value)}
            placeholder="What needs to change? Leave a specific note for the writer."
            rows={4}
            className="w-full text-sm bg-[var(--color-surface)] border border-[var(--color-outline)] rounded-md px-3 py-2 text-on-surface placeholder:text-on-surface-variant focus:outline-none"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setShowFeedback(false)
                setFeedbackText('')
              }}
              className="text-xs text-on-surface-variant hover:text-on-surface px-3 py-1.5"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={requestChanges}
              disabled={!!busy || !feedbackText.trim()}
              className="text-sm font-label px-4 py-2 rounded-md transition-opacity disabled:opacity-50"
              style={{
                background: 'var(--org-accent, var(--color-pib-accent))',
                color: '#000',
              }}
            >
              {busy === 'reject' ? 'Sending…' : 'Send feedback'}
            </button>
          </div>
        </section>
      )}

      {/* Comments thread */}
      {comments.length > 0 && (
        <section className="space-y-3">
          <p className="text-xs font-label uppercase tracking-widest text-on-surface-variant">
            Comments ({comments.length})
          </p>
          <ul className="space-y-3">
            {comments.map(c => (
              <li key={c.id} className="pib-card p-4">
                <div className="flex items-center gap-2 text-xs text-on-surface-variant">
                  <span className="font-medium text-on-surface">{c.userName}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wide bg-[var(--color-surface)]">
                    {c.userRole}
                  </span>
                  <span className="ml-auto">{formatTs(c.createdAt)}</span>
                </div>
                <p className="text-sm mt-2 whitespace-pre-wrap">{c.text}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function formatTs(ts: AnyObj): string {
  const sec = ts?._seconds ?? ts?.seconds
  if (!sec) return ''
  const d = new Date(sec * 1000)
  return d.toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
