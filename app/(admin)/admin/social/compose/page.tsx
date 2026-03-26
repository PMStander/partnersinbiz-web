'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

type SocialPlatform = 'x' | 'linkedin'
type SocialPostMode = 'single' | 'thread'
type SocialPostCategory = 'work' | 'personal' | 'ai' | 'sport' | 'sa' | 'other'

const CATEGORIES: SocialPostCategory[] = ['work', 'personal', 'ai', 'sport', 'sa', 'other']

const X_LIMIT = 280
const LI_LIMIT = 3000

export default function ComposePage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [platform, setPlatform] = useState<SocialPlatform>('x')
  const [mode, setMode] = useState<SocialPostMode>('single')
  const [content, setContent] = useState('')
  const [threadParts, setThreadParts] = useState<string[]>([''])
  const [scheduledFor, setScheduledFor] = useState('')
  const [category, setCategory] = useState<SocialPostCategory>('work')
  const [tagInput, setTagInput] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')

  // Pre-fill from URL params (replies page)
  useEffect(() => {
    const draft = searchParams.get('draft')
    if (draft) setContent(decodeURIComponent(draft))
    const topic = searchParams.get('topic')
    if (topic) {
      // optionally set a tag for the topic
      setTags([decodeURIComponent(topic)])
    }
  }, [searchParams])

  const charLimit = platform === 'x' ? X_LIMIT : LI_LIMIT

  const validate = useCallback(() => {
    const errs: Record<string, string> = {}
    if (platform === 'x' && mode === 'thread') {
      threadParts.forEach((part, i) => {
        if (!part.trim()) errs[`thread_${i}`] = 'Tweet cannot be empty.'
        if (part.length > X_LIMIT) errs[`thread_${i}_len`] = `Tweet ${i + 1} exceeds ${X_LIMIT} chars.`
      })
    } else {
      if (!content.trim()) errs['content'] = 'Content cannot be empty.'
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }, [platform, mode, content, threadParts])

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      const val = tagInput.trim().replace(/^,|,$/g, '')
      if (val && !tags.includes(val)) setTags((prev) => [...prev, val])
      setTagInput('')
    }
  }

  const removeTag = (tag: string) => setTags((prev) => prev.filter((t) => t !== tag))

  const addThreadPart = () => setThreadParts((prev) => [...prev, ''])
  const removeThreadPart = (i: number) => setThreadParts((prev) => prev.filter((_, idx) => idx !== i))
  const updateThreadPart = (i: number, val: string) => setThreadParts((prev) => prev.map((p, idx) => idx === i ? val : p))

  const buildBody = (status: 'draft' | 'scheduled') => {
    const body: any = {
      platform,
      status,
      category,
      tags,
    }
    if (platform === 'x' && mode === 'thread') {
      body.content = threadParts[0] ?? ''
      body.threadParts = threadParts
    } else {
      body.content = content
      body.threadParts = []
    }
    if (scheduledFor) {
      body.scheduledFor = new Date(scheduledFor).toISOString()
    }
    return body
  }

  const handleSaveDraft = async () => {
    if (!validate()) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/v1/social/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildBody('draft')),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Failed to save draft')
      setSuccessMsg('Draft saved.')
      setTimeout(() => router.push('/admin/social/queue'), 1200)
    } catch (err: any) {
      setErrors({ submit: err.message })
    } finally {
      setSubmitting(false)
    }
  }

  const handleSchedule = async () => {
    if (!validate()) return
    if (!scheduledFor) { setErrors({ submit: 'Set a schedule date/time first.' }); return }
    setSubmitting(true)
    try {
      const res = await fetch('/api/v1/social/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildBody('scheduled')),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Failed to schedule post')
      setSuccessMsg('Post scheduled.')
      setTimeout(() => router.push('/admin/social/queue'), 1200)
    } catch (err: any) {
      setErrors({ submit: err.message })
    } finally {
      setSubmitting(false)
    }
  }

  const handlePublishNow = async () => {
    if (!validate()) return
    setSubmitting(true)
    try {
      const createRes = await fetch('/api/v1/social/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildBody('draft')),
      })
      const createBody = await createRes.json()
      if (!createRes.ok) throw new Error(createBody.error ?? 'Failed to create post')
      const postId = createBody.data?.id
      if (!postId) throw new Error('No post ID returned')
      const pubRes = await fetch(`/api/v1/social/posts/${postId}/publish`, { method: 'POST' })
      const pubBody = await pubRes.json()
      if (!pubRes.ok) throw new Error(pubBody.error ?? 'Failed to publish')
      setSuccessMsg('Published successfully.')
      setTimeout(() => router.push('/admin/social/history'), 1200)
    } catch (err: any) {
      setErrors({ submit: err.message })
    } finally {
      setSubmitting(false)
    }
  }

  const minDateTime = new Date().toISOString().slice(0, 16)

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-on-surface">Compose Post</h1>
        <p className="text-sm text-on-surface-variant mt-1">Create and schedule social media content</p>
      </div>

      {successMsg && (
        <div className="px-4 py-3 rounded-xl bg-green-900/30 text-green-400 text-sm font-medium">
          {successMsg}
        </div>
      )}

      {errors.submit && (
        <div className="px-4 py-3 rounded-xl bg-red-900/30 text-red-400 text-sm">
          {errors.submit}
        </div>
      )}

      {/* Platform Toggle */}
      <div>
        <label className="block text-xs font-medium text-on-surface-variant uppercase tracking-wide mb-2">Platform</label>
        <div className="flex gap-2">
          {(['x', 'linkedin'] as SocialPlatform[]).map((p) => (
            <button
              key={p}
              onClick={() => setPlatform(p)}
              className={`px-4 py-2 rounded-lg font-label text-sm font-medium transition-colors ${
                platform === p
                  ? 'bg-white text-black'
                  : 'bg-surface-container text-on-surface hover:bg-surface-container-high'
              }`}
            >
              {p === 'x' ? '𝕏 X (Twitter)' : 'LinkedIn'}
            </button>
          ))}
        </div>
      </div>

      {/* Mode Toggle (X only) */}
      {platform === 'x' && (
        <div>
          <label className="block text-xs font-medium text-on-surface-variant uppercase tracking-wide mb-2">Mode</label>
          <div className="flex gap-2">
            {(['single', 'thread'] as SocialPostMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-4 py-2 rounded-lg font-label text-sm font-medium transition-colors capitalize ${
                  mode === m
                    ? 'bg-white text-black'
                    : 'bg-surface-container text-on-surface hover:bg-surface-container-high'
                }`}
              >
                {m === 'single' ? 'Single Tweet' : 'Thread'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Content */}
      {platform === 'x' && mode === 'thread' ? (
        <div className="space-y-3">
          <label className="block text-xs font-medium text-on-surface-variant uppercase tracking-wide">Thread Parts</label>
          {threadParts.map((part, i) => (
            <div key={i} className="rounded-xl bg-surface-container p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-on-surface-variant">Tweet {i + 1}</span>
                {threadParts.length > 1 && (
                  <button
                    onClick={() => removeThreadPart(i)}
                    className="text-xs text-red-400 hover:text-red-300 transition-colors"
                  >
                    Remove
                  </button>
                )}
              </div>
              <textarea
                rows={3}
                value={part}
                onChange={(e) => updateThreadPart(i, e.target.value)}
                placeholder={`Tweet ${i + 1}…`}
                className="w-full bg-transparent text-sm text-on-surface placeholder:text-on-surface-variant/50 resize-none outline-none"
              />
              <div className="flex justify-end">
                <span className={`text-xs ${part.length > X_LIMIT ? 'text-red-400' : 'text-on-surface-variant'}`}>
                  {part.length} / {X_LIMIT}
                </span>
              </div>
              {(errors[`thread_${i}`] || errors[`thread_${i}_len`]) && (
                <p className="text-xs text-red-400">{errors[`thread_${i}`] || errors[`thread_${i}_len`]}</p>
              )}
            </div>
          ))}
          <button
            onClick={addThreadPart}
            className="px-4 py-2 rounded-lg bg-surface-container text-on-surface font-label text-sm font-medium hover:bg-surface-container-high transition-colors"
          >
            + Add Tweet
          </button>
        </div>
      ) : (
        <div>
          <label className="block text-xs font-medium text-on-surface-variant uppercase tracking-wide mb-2">Content</label>
          <div className="rounded-xl bg-surface-container p-3">
            <textarea
              rows={6}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write your post…"
              className="w-full bg-transparent text-sm text-on-surface placeholder:text-on-surface-variant/50 resize-none outline-none"
            />
            <div className="flex justify-end mt-1">
              <span className={`text-xs ${content.length > charLimit ? 'text-red-400' : 'text-on-surface-variant'}`}>
                {content.length} / {charLimit}
              </span>
            </div>
          </div>
          {errors.content && <p className="text-xs text-red-400 mt-1">{errors.content}</p>}
        </div>
      )}

      {/* Schedule */}
      <div>
        <label className="block text-xs font-medium text-on-surface-variant uppercase tracking-wide mb-2">Schedule For</label>
        <input
          type="datetime-local"
          value={scheduledFor}
          min={minDateTime}
          onChange={(e) => setScheduledFor(e.target.value)}
          className="rounded-xl bg-surface-container px-4 py-2.5 text-sm text-on-surface outline-none border border-transparent focus:border-outline-variant transition-colors"
        />
        <p className="text-xs text-on-surface-variant mt-1">Leave empty to save as draft.</p>
      </div>

      {/* Category */}
      <div>
        <label className="block text-xs font-medium text-on-surface-variant uppercase tracking-wide mb-2">Category</label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as SocialPostCategory)}
          className="rounded-xl bg-surface-container px-4 py-2.5 text-sm text-on-surface outline-none border border-transparent focus:border-outline-variant transition-colors capitalize"
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c} className="capitalize">{c}</option>
          ))}
        </select>
      </div>

      {/* Tags */}
      <div>
        <label className="block text-xs font-medium text-on-surface-variant uppercase tracking-wide mb-2">Tags</label>
        <input
          type="text"
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={handleTagKeyDown}
          placeholder="Type a tag and press Enter or comma…"
          className="w-full rounded-xl bg-surface-container px-4 py-2.5 text-sm text-on-surface placeholder:text-on-surface-variant/50 outline-none border border-transparent focus:border-outline-variant transition-colors"
        />
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {tags.map((tag) => (
              <span
                key={tag}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface-container-high text-on-surface text-xs font-medium"
              >
                {tag}
                <button onClick={() => removeTag(tag)} className="text-on-surface-variant hover:text-on-surface transition-colors ml-0.5">×</button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3 pt-2">
        <button
          onClick={handleSaveDraft}
          disabled={submitting}
          className="px-4 py-2 rounded-lg bg-surface-container text-on-surface font-label text-sm font-medium hover:bg-surface-container-high transition-colors disabled:opacity-50"
        >
          Save Draft
        </button>
        <button
          onClick={handleSchedule}
          disabled={submitting || !scheduledFor}
          className="px-4 py-2 rounded-lg bg-white text-black font-label text-sm font-medium hover:bg-white/90 transition-colors disabled:opacity-50"
        >
          Schedule
        </button>
        <button
          onClick={handlePublishNow}
          disabled={submitting}
          className="px-4 py-2 rounded-lg bg-surface-container text-on-surface font-label text-sm font-medium hover:bg-surface-container-high transition-colors disabled:opacity-50"
        >
          Publish Now
        </button>
      </div>
    </div>
  )
}
