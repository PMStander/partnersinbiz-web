'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

type SocialPostMode = 'single' | 'thread'
type SocialPostCategory = 'work' | 'personal' | 'ai' | 'sport' | 'sa' | 'other'

const CATEGORIES: SocialPostCategory[] = ['work', 'personal', 'ai', 'sport', 'sa', 'other']

const PLATFORMS = [
  { id: 'twitter', label: 'X (Twitter)', color: 'bg-black', short: 'X' },
  { id: 'linkedin', label: 'LinkedIn', color: 'bg-blue-700', short: 'LI' },
  { id: 'facebook', label: 'Facebook', color: 'bg-blue-600', short: 'FB' },
  { id: 'instagram', label: 'Instagram', color: 'bg-pink-600', short: 'IG' },
  { id: 'reddit', label: 'Reddit', color: 'bg-orange-600', short: 'RD' },
  { id: 'tiktok', label: 'TikTok', color: 'bg-gray-800', short: 'TT' },
  { id: 'pinterest', label: 'Pinterest', color: 'bg-red-700', short: 'PI' },
  { id: 'bluesky', label: 'Bluesky', color: 'bg-sky-500', short: 'BS' },
  { id: 'threads', label: 'Threads', color: 'bg-gray-700', short: 'TH' },
] as const

const THREAD_CAPABLE = ['twitter', 'bluesky', 'threads']

const CHAR_LIMITS: Record<string, number> = {
  twitter: 280,
  linkedin: 3000,
  facebook: 63206,
  instagram: 2200,
  reddit: 40000,
  tiktok: 2200,
  pinterest: 500,
  bluesky: 300,
  threads: 500,
}

interface Account {
  id: string
  platform: string
  name?: string
  username?: string
  [key: string]: any
}

export default function ComposePage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(['twitter'])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([])
  const [mode, setMode] = useState<SocialPostMode>('single')
  const [content, setContent] = useState('')
  const [threadParts, setThreadParts] = useState<string[]>([''])
  const [scheduledFor, setScheduledFor] = useState('')
  const [category, setCategory] = useState<SocialPostCategory>('work')
  const [tagInput, setTagInput] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [hashtagInput, setHashtagInput] = useState('')
  const [hashtags, setHashtags] = useState<string[]>([])
  const [labelInput, setLabelInput] = useState('')
  const [labels, setLabels] = useState<string[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')

  // AI state
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiCaptions, setAiCaptions] = useState<Array<{ text: string; hashtags: string[] }>>([])
  const [aiHashtags, setAiHashtags] = useState<Array<{ tag: string; relevance: number }>>([])
  const [showAi, setShowAi] = useState(false)

  // Fetch connected accounts
  useEffect(() => {
    fetch('/api/v1/social/accounts').then(r => r.json()).then(b => setAccounts(b.data ?? []))
  }, [])

  // Pre-fill from URL params (replies page + calendar click-to-create)
  useEffect(() => {
    const draft = searchParams.get('draft')
    if (draft) setContent(decodeURIComponent(draft))
    const topic = searchParams.get('topic')
    if (topic) {
      setTags([decodeURIComponent(topic)])
    }
    const scheduledAtParam = searchParams.get('scheduledAt')
    if (scheduledAtParam) setScheduledFor(scheduledAtParam)
  }, [searchParams])

  // Reset mode to single when no thread-capable platform is selected
  useEffect(() => {
    const hasThreadCapable = selectedPlatforms.some(p => THREAD_CAPABLE.includes(p))
    if (!hasThreadCapable && mode === 'thread') {
      setMode('single')
    }
  }, [selectedPlatforms, mode])

  // Deselect accounts whose platform is no longer selected
  useEffect(() => {
    setSelectedAccountIds(prev =>
      prev.filter(id => {
        const acc = accounts.find(a => a.id === id)
        return acc && selectedPlatforms.includes(acc.platform)
      })
    )
  }, [selectedPlatforms, accounts])

  const charLimit = selectedPlatforms.length > 0
    ? Math.min(...selectedPlatforms.map(p => CHAR_LIMITS[p] ?? 5000))
    : 280

  const showThreadToggle = selectedPlatforms.some(p => THREAD_CAPABLE.includes(p))

  const togglePlatform = (id: string) => {
    setSelectedPlatforms(prev =>
      prev.includes(id)
        ? prev.filter(p => p !== id)
        : [...prev, id]
    )
  }

  const toggleAccount = (id: string) => {
    setSelectedAccountIds(prev =>
      prev.includes(id)
        ? prev.filter(a => a !== id)
        : [...prev, id]
    )
  }

  const filteredAccounts = accounts.filter(a => selectedPlatforms.includes(a.platform))

  const validate = useCallback(() => {
    const errs: Record<string, string> = {}
    if (selectedPlatforms.length === 0) errs['platforms'] = 'Select at least one platform.'
    if (mode === 'thread' && showThreadToggle) {
      threadParts.forEach((part, i) => {
        if (!part.trim()) errs[`thread_${i}`] = 'Post cannot be empty.'
        if (part.length > charLimit) errs[`thread_${i}_len`] = `Part ${i + 1} exceeds ${charLimit} chars.`
      })
    } else {
      if (!content.trim()) errs['content'] = 'Content cannot be empty.'
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }, [selectedPlatforms, mode, content, threadParts, charLimit, showThreadToggle])

  const makeChipKeyDown = (
    input: string,
    setInput: (v: string) => void,
    items: string[],
    setItems: (fn: (prev: string[]) => string[]) => void,
    prefix?: string,
  ) => (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      let val = input.trim().replace(/^,|,$/g, '')
      if (prefix && !val.startsWith(prefix)) val = prefix + val
      if (val && (prefix ? val.length > prefix.length : val.length > 0) && !items.includes(val)) {
        setItems(prev => [...prev, val])
      }
      setInput('')
    }
  }

  const handleTagKeyDown = makeChipKeyDown(tagInput, setTagInput, tags, setTags)
  const handleHashtagKeyDown = makeChipKeyDown(hashtagInput, setHashtagInput, hashtags, setHashtags, '#')
  const handleLabelKeyDown = makeChipKeyDown(labelInput, setLabelInput, labels, setLabels)

  const removeTag = (tag: string) => setTags(prev => prev.filter(t => t !== tag))
  const removeHashtag = (h: string) => setHashtags(prev => prev.filter(t => t !== h))
  const removeLabel = (l: string) => setLabels(prev => prev.filter(t => t !== l))

  const addThreadPart = () => setThreadParts(prev => [...prev, ''])
  const removeThreadPart = (i: number) => setThreadParts(prev => prev.filter((_, idx) => idx !== i))
  const updateThreadPart = (i: number, val: string) => setThreadParts(prev => prev.map((p, idx) => idx === i ? val : p))

  const buildBody = (status: 'draft' | 'scheduled') => {
    const isThread = mode === 'thread' && showThreadToggle
    const body: any = {
      content: {
        text: isThread ? (threadParts[0] ?? '') : content,
        platformOverrides: {},
      },
      platforms: selectedPlatforms,
      accountIds: selectedAccountIds,
      status,
      category,
      tags,
      hashtags,
      labels,
    }
    if (isThread) {
      body.content.threadParts = threadParts
    }
    if (scheduledFor) {
      body.scheduledAt = new Date(scheduledFor).toISOString()
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

  const handleAiGenerate = async () => {
    if (!aiPrompt.trim()) return
    setAiLoading(true)
    setAiCaptions([])
    try {
      const res = await fetch('/api/v1/social/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: aiPrompt,
          platform: selectedPlatforms[0] ?? 'twitter',
          tone: 'professional',
          count: 3,
          includeHashtags: true,
        }),
      })
      const body = await res.json()
      if (body.data?.captions) setAiCaptions(body.data.captions)
    } catch { /* ignore */ }
    finally { setAiLoading(false) }
  }

  const handleAiHashtags = async () => {
    if (!content.trim()) return
    setAiLoading(true)
    setAiHashtags([])
    try {
      const res = await fetch('/api/v1/social/ai/hashtags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: content,
          platform: selectedPlatforms[0] ?? 'twitter',
          count: 10,
        }),
      })
      const body = await res.json()
      if (body.data?.hashtags) setAiHashtags(body.data.hashtags)
    } catch { /* ignore */ }
    finally { setAiLoading(false) }
  }

  const useCaption = (caption: { text: string; hashtags: string[] }) => {
    setContent(caption.text)
    if (caption.hashtags?.length) {
      setHashtags(prev => [...new Set([...prev, ...caption.hashtags])])
    }
    setAiCaptions([])
  }

  const useHashtag = (tag: string) => {
    if (!hashtags.includes(tag)) setHashtags(prev => [...prev, tag])
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

      {/* Platform Multi-Select */}
      <div>
        <label className="block text-xs font-medium text-on-surface-variant uppercase tracking-wide mb-2">Platforms</label>
        <div className="flex flex-wrap gap-2">
          {PLATFORMS.map((p) => (
            <button
              key={p.id}
              onClick={() => togglePlatform(p.id)}
              className={`px-4 py-2 rounded-lg font-label text-sm font-medium transition-colors ${
                selectedPlatforms.includes(p.id)
                  ? 'bg-white text-black'
                  : 'bg-surface-container text-on-surface hover:bg-surface-container-high'
              }`}
            >
              <span className={`inline-block w-5 h-5 rounded text-[10px] font-bold leading-5 text-center text-white mr-1.5 align-middle ${p.color}`}>
                {p.short}
              </span>
              {p.label}
            </button>
          ))}
        </div>
        {errors.platforms && <p className="text-xs text-red-400 mt-1">{errors.platforms}</p>}
      </div>

      {/* Account Selector */}
      {filteredAccounts.length > 0 && (
        <div>
          <label className="block text-xs font-medium text-on-surface-variant uppercase tracking-wide mb-2">Accounts</label>
          <div className="rounded-xl bg-surface-container p-3 space-y-2">
            {selectedPlatforms.map(platformId => {
              const platformAccounts = filteredAccounts.filter(a => a.platform === platformId)
              if (platformAccounts.length === 0) return null
              const platformMeta = PLATFORMS.find(p => p.id === platformId)
              return (
                <div key={platformId}>
                  <p className="text-xs text-on-surface-variant font-medium mb-1">{platformMeta?.label ?? platformId}</p>
                  {platformAccounts.map(acc => (
                    <label
                      key={acc.id}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-surface-container-high transition-colors cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedAccountIds.includes(acc.id)}
                        onChange={() => toggleAccount(acc.id)}
                        className="accent-white"
                      />
                      <span className="text-sm text-on-surface">{acc.name || acc.username || acc.id}</span>
                    </label>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Mode Toggle (thread-capable platforms only) */}
      {showThreadToggle && (
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
                {m === 'single' ? 'Single Post' : 'Thread'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Content */}
      {mode === 'thread' && showThreadToggle ? (
        <div className="space-y-3">
          <label className="block text-xs font-medium text-on-surface-variant uppercase tracking-wide">Thread Parts</label>
          {threadParts.map((part, i) => (
            <div key={i} className="rounded-xl bg-surface-container p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-on-surface-variant">Part {i + 1}</span>
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
                placeholder={`Part ${i + 1}...`}
                className="w-full bg-transparent text-sm text-on-surface placeholder:text-on-surface-variant/50 resize-none outline-none"
              />
              <div className="flex justify-end">
                <span className={`text-xs ${part.length > charLimit ? 'text-red-400' : 'text-on-surface-variant'}`}>
                  {part.length} / {charLimit}
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
            + Add Part
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
              placeholder="Write your post..."
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

      {/* AI Assist */}
      <div className="rounded-xl bg-surface-container p-4 space-y-3">
        <button
          onClick={() => setShowAi(!showAi)}
          className="flex items-center gap-2 text-sm font-medium text-on-surface hover:text-white transition-colors"
        >
          <span className="text-base">✦</span>
          AI Assist
          <span className="text-[10px] text-on-surface-variant">{showAi ? '▲' : '▼'}</span>
        </button>

        {showAi && (
          <div className="space-y-3 pt-1">
            {/* Generate captions */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-on-surface-variant uppercase tracking-wide">Generate Caption</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAiGenerate()}
                  placeholder="Topic or prompt (e.g. 'AI in marketing')"
                  className="flex-1 rounded-lg bg-surface px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/50 outline-none border border-transparent focus:border-outline-variant transition-colors"
                />
                <button
                  onClick={handleAiGenerate}
                  disabled={aiLoading || !aiPrompt.trim()}
                  className="px-3 py-2 rounded-lg bg-white text-black font-label text-xs font-medium hover:bg-white/90 transition-colors disabled:opacity-50 shrink-0"
                >
                  {aiLoading ? 'Generating…' : 'Generate'}
                </button>
              </div>

              {aiCaptions.length > 0 && (
                <div className="space-y-1.5">
                  {aiCaptions.map((caption, i) => (
                    <div key={i} className="rounded-lg bg-surface p-2.5 group">
                      <p className="text-xs text-on-surface leading-relaxed">{caption.text}</p>
                      {caption.hashtags?.length > 0 && (
                        <p className="text-[10px] text-on-surface-variant mt-1">{caption.hashtags.join(' ')}</p>
                      )}
                      <button
                        onClick={() => useCaption(caption)}
                        className="mt-1.5 text-[10px] text-blue-400 hover:text-blue-300 font-medium transition-colors"
                      >
                        Use this caption
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Suggest hashtags */}
            {content.trim() && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-on-surface-variant uppercase tracking-wide">Suggest Hashtags</label>
                  <button
                    onClick={handleAiHashtags}
                    disabled={aiLoading}
                    className="px-2 py-1 rounded-lg bg-surface text-on-surface-variant font-label text-[10px] font-medium hover:bg-surface-container-high transition-colors disabled:opacity-50"
                  >
                    {aiLoading ? 'Loading…' : 'Suggest'}
                  </button>
                </div>
                {aiHashtags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {aiHashtags.map((h, i) => (
                      <button
                        key={i}
                        onClick={() => useHashtag(h.tag)}
                        disabled={hashtags.includes(h.tag)}
                        className={`text-[10px] px-2 py-0.5 rounded-full font-medium transition-colors ${
                          hashtags.includes(h.tag)
                            ? 'bg-surface-container-high text-on-surface-variant/40'
                            : 'bg-surface text-on-surface hover:bg-surface-container-high'
                        }`}
                      >
                        {h.tag} <span className="text-on-surface-variant/60">{Math.round(h.relevance * 100)}%</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

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

      {/* Hashtags */}
      <div>
        <label className="block text-xs font-medium text-on-surface-variant uppercase tracking-wide mb-2">Hashtags</label>
        <input
          type="text"
          value={hashtagInput}
          onChange={(e) => setHashtagInput(e.target.value)}
          onKeyDown={handleHashtagKeyDown}
          placeholder="Type a hashtag and press Enter or comma..."
          className="w-full rounded-xl bg-surface-container px-4 py-2.5 text-sm text-on-surface placeholder:text-on-surface-variant/50 outline-none border border-transparent focus:border-outline-variant transition-colors"
        />
        {hashtags.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {hashtags.map((h) => (
              <span
                key={h}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface-container-high text-on-surface text-xs font-medium"
              >
                {h}
                <button onClick={() => removeHashtag(h)} className="text-on-surface-variant hover:text-on-surface transition-colors ml-0.5">x</button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Labels */}
      <div>
        <label className="block text-xs font-medium text-on-surface-variant uppercase tracking-wide mb-2">Labels</label>
        <input
          type="text"
          value={labelInput}
          onChange={(e) => setLabelInput(e.target.value)}
          onKeyDown={handleLabelKeyDown}
          placeholder="Type a label and press Enter or comma..."
          className="w-full rounded-xl bg-surface-container px-4 py-2.5 text-sm text-on-surface placeholder:text-on-surface-variant/50 outline-none border border-transparent focus:border-outline-variant transition-colors"
        />
        {labels.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {labels.map((l) => (
              <span
                key={l}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface-container-high text-on-surface text-xs font-medium"
              >
                {l}
                <button onClick={() => removeLabel(l)} className="text-on-surface-variant hover:text-on-surface transition-colors ml-0.5">x</button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Tags */}
      <div>
        <label className="block text-xs font-medium text-on-surface-variant uppercase tracking-wide mb-2">Tags</label>
        <input
          type="text"
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={handleTagKeyDown}
          placeholder="Type a tag and press Enter or comma..."
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
                <button onClick={() => removeTag(tag)} className="text-on-surface-variant hover:text-on-surface transition-colors ml-0.5">x</button>
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
