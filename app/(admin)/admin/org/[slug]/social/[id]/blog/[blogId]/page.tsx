'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { BlogReaderCard } from '@/components/campaign-preview'
import { OrgThemedFrame, useOrgBrand } from '@/components/admin/OrgThemedFrame'
import {
  SelectionPopover,
  CommentComposer,
  CommentList,
  type AnchorTarget,
  type InlineComment,
} from '@/components/inline-comments'
import { BlogEditor } from '@/components/blog-editor/BlogEditor'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = any

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
  const [comments, setComments] = useState<InlineComment[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<null | 'approve' | 'comment' | 'save'>(null)
  const [publishDate, setPublishDate] = useState('')
  const [composerAnchor, setComposerAnchor] = useState<AnchorTarget | null>(null)
  const [editing, setEditing] = useState(false)

  const bodyRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetch(`/api/v1/campaigns/${id}/assets`).then(r => r.json()),
      fetch(`/api/v1/seo/content/${blogId}/comments`).then(r => r.json()),
    ])
      .then(([a, c]) => {
        const blogs = (a.data?.blogs ?? []) as AnyObj[]
        setBlog(blogs.find(b => b.id === blogId) ?? null)
        setComments((c.data ?? []) as InlineComment[])
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

  // Click-on-image-to-comment via event delegation. Also marks every <img>
  // inside the body with a "💬 Comment on image" affordance on hover.
  useEffect(() => {
    const root = bodyRef.current
    if (!root) return
    const onClick = (e: MouseEvent) => {
      const tgt = e.target as HTMLElement
      if (tgt?.tagName === 'IMG') {
        const img = tgt as HTMLImageElement
        if (img.src) {
          e.preventDefault()
          setComposerAnchor({ kind: 'image', mediaUrl: img.src })
        }
      }
    }
    root.addEventListener('click', onClick)
    return () => root.removeEventListener('click', onClick)
  }, [previewBlog])

  // Add hover-cursor on every image inside the body so it's discoverable
  useEffect(() => {
    const root = bodyRef.current
    if (!root) return
    const imgs = root.querySelectorAll('img')
    imgs.forEach(img => {
      img.style.cursor = 'pointer'
      img.title = 'Click to comment on this image'
    })
  }, [previewBlog])

  async function postComment(text: string, anchor: AnchorTarget) {
    if (!text.trim()) return
    setBusy('comment')
    try {
      const payload: AnyObj = { text: text.trim() }
      if (anchor.kind === 'text') {
        payload.anchor = { type: 'text', text: anchor.text }
        if (typeof anchor.offset === 'number') payload.anchor.offset = anchor.offset
      } else if (anchor.kind === 'image') {
        payload.anchor = { type: 'image', mediaUrl: anchor.mediaUrl }
      }
      const r = await fetch(`/api/v1/seo/content/${blogId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!r.ok) throw new Error('comment failed')
      const refreshed = await fetch(`/api/v1/seo/content/${blogId}/comments`).then(r => r.json())
      setComments((refreshed.data ?? []) as InlineComment[])
      setComposerAnchor(null)
    } finally {
      setBusy(null)
    }
  }

  function scrollToAnchor(c: InlineComment) {
    const root = bodyRef.current
    if (!root || !c.anchor) return
    if (c.anchor.type === 'text') {
      const needle = c.anchor.text.slice(0, 60)
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      let node: Node | null = walker.currentNode
      while ((node = walker.nextNode())) {
        if ((node.textContent ?? '').includes(needle)) {
          const range = document.createRange()
          const idx = node.textContent!.indexOf(needle)
          range.setStart(node, idx)
          range.setEnd(node, Math.min(node.textContent!.length, idx + needle.length))
          const rect = range.getBoundingClientRect()
          window.scrollTo({ top: rect.top + window.scrollY - 120, behavior: 'smooth' })
          // Brief highlight via selection
          const sel = window.getSelection()
          sel?.removeAllRanges()
          sel?.addRange(range)
          window.setTimeout(() => sel?.removeAllRanges(), 1800)
          return
        }
      }
    }
    if (c.anchor.type === 'image') {
      const imageUrl = c.anchor.mediaUrl
      const imgs = root.querySelectorAll('img')
      const target = Array.from(imgs).find(img => img.src === imageUrl)
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' })
        target.style.outline = '3px solid var(--org-accent, #F5A623)'
        window.setTimeout(() => (target.style.outline = ''), 1800)
      }
    }
  }

  async function approve() {
    if (busy) return
    setBusy('approve')
    try {
      const r = await fetch(`/api/v1/seo/content/${blogId}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(publishDate ? { publishDate } : {}),
      })
      if (!r.ok) throw new Error('publish failed')
      router.refresh()
      router.push(`/admin/org/${slug}/social/${id}?tab=blogs`)
    } finally {
      setBusy(null)
    }
  }

  async function saveBody(markdown: string) {
    if (busy) return
    const draftId = blog?.draftPostId
    if (!draftId) return
    setBusy('save')
    try {
      const r = await fetch(`/api/v1/seo/drafts/${draftId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: markdown }),
      })
      if (!r.ok) throw new Error('save failed')
      const a = await fetch(`/api/v1/campaigns/${id}/assets`).then(r => r.json())
      const blogs = (a.data?.blogs ?? []) as AnyObj[]
      setBlog(blogs.find(b => b.id === blogId) ?? null)
      setEditing(false)
    } finally {
      setBusy(null)
    }
  }

  if (loading) {
    return <div className="pib-skeleton h-96 max-w-7xl mx-auto rounded-2xl" />
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
  const anchoredCount = comments.filter(c => !!c.anchor).length
  const canEdit = !isPublished && !!blog?.draftPostId

  return (
    <div className="space-y-8 max-w-7xl mx-auto" style={{ color: 'var(--org-text, var(--color-pib-text))' }}>
      {/* Header */}
      <header className="space-y-2">
        <Link
          href={`/admin/org/${slug}/social/${id}?tab=blogs`}
          className="text-xs text-on-surface-variant hover:text-on-surface inline-flex items-center gap-1"
        >
          ← {orgName ? `${orgName} · Blog Posts` : 'Blog Posts'}
        </Link>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <p
            className="text-[10px] font-label uppercase tracking-[0.2em]"
            style={{ color: 'var(--org-accent, var(--color-pib-accent))' }}
          >
            Blog Post · {isPublished ? 'Published' : 'Awaiting Review'}
            {anchoredCount > 0 && (
              <span className="ml-2 normal-case tracking-normal text-on-surface-variant">
                · {anchoredCount} inline comment{anchoredCount === 1 ? '' : 's'}
              </span>
            )}
          </p>
          {canEdit && !editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-xs font-label px-3 py-1.5 rounded-md border border-[var(--org-border,var(--color-pib-line))] hover:bg-[var(--color-surface)] transition-colors"
            >
              ✏️ Edit body
            </button>
          )}
        </div>
      </header>

      {/* Helper banner */}
      {!isPublished && !editing && (
        <div
          className="pib-card p-4 text-xs leading-relaxed flex items-start gap-3"
          style={{
            borderColor: 'var(--org-accent, var(--color-pib-accent))',
            background: 'rgba(245,166,35,0.06)',
          }}
        >
          <span aria-hidden style={{ color: 'var(--org-accent, var(--color-pib-accent))' }}>
            💬
          </span>
          <p>
            <strong>Highlight any text</strong> to leave an inline comment,{' '}
            <strong>click an image</strong> to comment on it, or{' '}
            <strong>click "Edit body"</strong> to make changes yourself. Agents
            and the writer see exactly what you flagged or changed.
          </p>
        </div>
      )}

      {/* Edit mode */}
      {editing && previewBlog.draft?.body !== undefined && (
        <BlogEditor
          initialMarkdown={previewBlog.draft.body ?? ''}
          busy={busy === 'save'}
          onSave={saveBody}
          onCancel={() => setEditing(false)}
        />
      )}

      {/* Read mode */}
      {!editing && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 items-start relative">
          {/* Reader */}
          <div ref={bodyRef} className="relative w-full overflow-hidden">
            <SelectionPopover
              containerRef={bodyRef}
              onComment={text =>
                setComposerAnchor({ kind: 'text', text })
              }
            />
            <BlogReaderCard blog={previewBlog} brand={brand} />
          </div>

          {/* Sidebar */}
          <aside className="lg:sticky lg:top-6 space-y-3">
            <p className="text-xs font-label uppercase tracking-widest text-on-surface-variant">
              Comments ({comments.length})
            </p>
            <CommentList comments={comments} onScrollToAnchor={scrollToAnchor} />
            <button
              type="button"
              onClick={() => setComposerAnchor({ kind: 'general' })}
              disabled={isPublished}
              className="w-full text-xs font-label px-3 py-2 rounded-md border border-[var(--org-border,var(--color-pib-line))] hover:bg-[var(--color-surface)] transition-colors disabled:opacity-50"
            >
              + General comment
            </button>
          </aside>
        </div>
      )}

      {/* Approval bar */}
      {!isPublished && (
        <section className="pib-card sticky bottom-4 p-5 flex flex-col gap-3 backdrop-blur-md">
          <div>
            <p className="text-sm font-headline font-semibold">Ready to ship?</p>
            <p className="text-xs text-on-surface-variant">
              {comments.length === 0
                ? 'Approve to publish, or highlight text / click an image to leave inline feedback.'
                : `${comments.length} comment${comments.length === 1 ? '' : 's'} pending. Approve to publish anyway, or wait for the writer to address them.`}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <label className="text-xs text-on-surface-variant whitespace-nowrap">Publish date</label>
              <input
                type="date"
                value={publishDate}
                min={new Date().toISOString().slice(0, 10)}
                onChange={e => setPublishDate(e.target.value)}
                className="text-xs rounded-md px-2 py-1.5 bg-surface-container-high text-on-surface border border-[var(--org-border,var(--color-pib-line))] focus:outline-none"
              />
              <span className="text-[10px] text-on-surface-variant">(leave blank = publish now)</span>
            </div>
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
              {busy === 'approve'
                ? (publishDate && publishDate > new Date().toISOString().slice(0, 10) ? 'Scheduling…' : 'Publishing…')
                : (publishDate && publishDate > new Date().toISOString().slice(0, 10)
                    ? `Schedule for ${publishDate}`
                    : 'Approve & publish')}
            </button>
          </div>
        </section>
      )}

      {/* Composer modal */}
      {composerAnchor && (
        <CommentComposer
          anchor={composerAnchor}
          busy={busy === 'comment'}
          onCancel={() => setComposerAnchor(null)}
          onSubmit={text => postComment(text, composerAnchor)}
        />
      )}
    </div>
  )
}
