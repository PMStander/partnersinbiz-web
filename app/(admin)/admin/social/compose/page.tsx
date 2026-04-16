'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useOrg } from '@/lib/contexts/OrgContext'
import PlatformPreview from '@/components/social/PlatformPreview'

type SocialPostMode = 'single' | 'thread'
type SocialPostCategory = 'work' | 'personal' | 'ai' | 'sport' | 'sa' | 'other'

interface ImageTemplate {
  id: string
  name: string
  description: string
  promptTemplate: string
  suggestedSize: '1024x1024' | '1024x1536' | '1536x1024'
  category: string
}

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
  { id: 'youtube', label: 'YouTube', color: 'bg-red-600', short: 'YT' },
  { id: 'mastodon', label: 'Mastodon', color: 'bg-purple-600', short: 'MA' },
  { id: 'dribbble', label: 'Dribbble', color: 'bg-pink-500', short: 'DR' },
] as const

const THREAD_CAPABLE = ['twitter', 'bluesky', 'threads', 'mastodon']

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
  youtube: 5000,
  mastodon: 500,
  dribbble: 500,
}

interface Account {
  id: string
  platform: string
  name?: string
  username?: string
  [key: string]: any
}

export default function ComposePage() {
  const { orgId } = useOrg()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([])
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

  // Preview state
  const [showPreview, setShowPreview] = useState(false)

  // AI state
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiCaptions, setAiCaptions] = useState<Array<{ text: string; hashtags: string[] }>>([])
  const [aiHashtags, setAiHashtags] = useState<Array<{ tag: string; relevance: number }>>([])
  const [showAi, setShowAi] = useState(false)

  // Best time state
  const [bestTimeLoading, setBestTimeLoading] = useState(false)

  // AI Image state
  const [showImageModal, setShowImageModal] = useState(false)
  const [imagePrompt, setImagePrompt] = useState('')
  const [imageProvider, setImageProvider] = useState<'xai' | 'gemini'>('xai')
  const [imageSize, setImageSize] = useState<'1024x1024' | '1024x1536' | '1536x1024'>('1024x1024')
  const [selectedTemplate, setSelectedTemplate] = useState<string>('')
  const [imageTemplates, setImageTemplates] = useState<ImageTemplate[]>([])
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string>('')
  const [generatedPrompt, setGeneratedPrompt] = useState<string>('')
  const [imageLoading, setImageLoading] = useState(false)
  const [imageError, setImageError] = useState<string>('')
  const [mediaItems, setMediaItems] = useState<Array<{ id: string; url: string; type: 'image' }>>([])
  const [templatesLoading, setTemplatesLoading] = useState(false)

  // Fetch connected accounts
  useEffect(() => {
    fetch(`/api/v1/social/accounts${orgId ? `?orgId=${orgId}` : ''}`).then(r => r.json()).then(b => setAccounts(b.data ?? []))
  }, [orgId])

  // Fetch image templates
  useEffect(() => {
    const fetchTemplates = async () => {
      setTemplatesLoading(true)
      try {
        const res = await fetch('/api/v1/social/ai/image-templates')
        const data = await res.json()
        if (data.data) setImageTemplates(data.data)
      } catch {
        /* ignore */
      } finally {
        setTemplatesLoading(false)
      }
    }
    fetchTemplates()
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
      const res = await fetch(`/api/v1/social/posts${orgId ? `?orgId=${orgId}` : ''}`, {
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
      const res = await fetch(`/api/v1/social/posts${orgId ? `?orgId=${orgId}` : ''}`, {
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
      const createRes = await fetch(`/api/v1/social/posts${orgId ? `?orgId=${orgId}` : ''}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildBody('draft')),
      })
      const createBody = await createRes.json()
      if (!createRes.ok) throw new Error(createBody.error ?? 'Failed to create post')
      const postId = createBody.data?.id
      if (!postId) throw new Error('No post ID returned')
      const pubRes = await fetch(`/api/v1/social/posts/${postId}/publish${orgId ? `?orgId=${orgId}` : ''}`, { method: 'POST' })
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

  const handleBestTime = async () => {
    setBestTimeLoading(true)
    try {
      // Use the first selected platform or default to twitter
      const platform = selectedPlatforms.length > 0 ? selectedPlatforms[0] : 'twitter'
      const res = await fetch(`/api/v1/social/ai/best-time?platform=${encodeURIComponent(platform)}`)
      const data = await res.json()

      if (res.ok && data.data?.slots && data.data.slots.length > 0) {
        const bestSlot = data.data.slots[0]
        // slots have format: { dayOfWeek: number, hour: number, ... }
        // Create a datetime for next occurrence of this day/hour
        const now = new Date()
        const targetDate = new Date(now)

        // Calculate days until target day of week
        const dayDiff = (bestSlot.dayOfWeek - now.getDay() + 7) % 7
        if (dayDiff === 0 && now.getHours() >= bestSlot.hour) {
          targetDate.setDate(targetDate.getDate() + 7)
        } else if (dayDiff > 0) {
          targetDate.setDate(targetDate.getDate() + dayDiff)
        }

        targetDate.setHours(bestSlot.hour, 0, 0, 0)

        // Convert to datetime-local format (YYYY-MM-DDTHH:mm)
        const local = new Date(targetDate.getTime() - targetDate.getTimezoneOffset() * 60000)
          .toISOString()
          .slice(0, 16)
        setScheduledFor(local)
      }
    } catch {
      // silent fail — user can still pick manually
    } finally {
      setBestTimeLoading(false)
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

  const handleGenerateImage = async () => {
    if (!imagePrompt.trim()) {
      setImageError('Please enter an image prompt')
      return
    }

    setImageLoading(true)
    setImageError('')
    setGeneratedImageUrl('')
    setGeneratedPrompt('')

    try {
      const res = await fetch('/api/v1/social/ai/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: imagePrompt,
          provider: imageProvider,
          size: imageSize,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setImageError(data.error ?? 'Failed to generate image')
        return
      }

      if (data.data) {
        setGeneratedImageUrl(data.data.url)
        setGeneratedPrompt(data.data.revisedPrompt)
      }
    } catch (err: any) {
      setImageError(err.message ?? 'Error generating image')
    } finally {
      setImageLoading(false)
    }
  }

  const handleUseImage = () => {
    if (!generatedImageUrl) return

    const newMedia = {
      id: `media-${Date.now()}`,
      url: generatedImageUrl,
      type: 'image' as const,
    }

    setMediaItems(prev => [...prev, newMedia])
    setGeneratedImageUrl('')
    setGeneratedPrompt('')
    setImagePrompt('')
    setSelectedTemplate('')
    setShowImageModal(false)
  }

  const removeMediaItem = (id: string) => {
    setMediaItems(prev => prev.filter(m => m.id !== id))
  }

  const fillTemplatePrompt = (template: ImageTemplate) => {
    // Simple template filling - just show the template prompt
    // User can edit it manually before generating
    setImagePrompt(template.promptTemplate)
    setImageSize(template.suggestedSize)
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

      {/* Platform Multi-Select — only platforms with connected accounts */}
      <div>
        <label className="block text-xs font-medium text-on-surface-variant uppercase tracking-wide mb-2">Platforms</label>
        {(() => {
          const connectedPlatformIds = new Set(accounts.filter(a => a.status !== 'disconnected').map(a => a.platform))
          const availablePlatforms = PLATFORMS.filter(p => connectedPlatformIds.has(p.id))
          if (availablePlatforms.length === 0) {
            return (
              <div className="rounded-xl bg-surface-container p-4 text-center">
                <p className="text-sm text-on-surface-variant">No social accounts connected.</p>
                <a href="/admin/social/accounts" className="text-xs text-blue-400 hover:text-blue-300 mt-1 inline-block">
                  Connect accounts →
                </a>
              </div>
            )
          }
          return (
            <div className="flex flex-wrap gap-2">
              {availablePlatforms.map((p) => (
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
          )
        })()}
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
                      <span className="text-sm text-on-surface">{acc.displayName || acc.username || acc.id}</span>
                    </label>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Mode Toggle and Preview Toggle */}
      <div className="flex flex-col sm:flex-row gap-4">
        {showThreadToggle && (
          <div className="flex-1">
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

        {/* Preview Toggle */}
        <div className={showThreadToggle ? 'flex-1' : 'w-full'}>
          <label className="block text-xs font-medium text-on-surface-variant uppercase tracking-wide mb-2">Preview</label>
          <button
            onClick={() => setShowPreview(p => !p)}
            className={`w-full px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              showPreview
                ? 'bg-amber-500 text-black font-label'
                : 'bg-surface-container text-on-surface hover:bg-surface-container-high font-label'
            }`}
          >
            {showPreview ? 'Hide Preview' : 'Show Preview'}
          </button>
        </div>
      </div>

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

      {/* Preview Panel */}
      {showPreview && selectedPlatforms.length > 0 && (
        <div className="rounded-xl bg-surface-container p-6">
          <h3 className="text-sm font-semibold text-on-surface mb-4">Platform Preview</h3>
          <div className="flex gap-4 overflow-x-auto pb-4">
            {selectedPlatforms.map(platformId => {
              const platform = PLATFORMS.find(p => p.id === platformId)
              return (
                <div key={platformId} className="flex-shrink-0">
                  <PlatformPreview
                    platform={platformId}
                    content={mode === 'thread' ? threadParts.join('\n\n') : content}
                    mediaItems={mediaItems}
                    charLimit={CHAR_LIMITS[platformId] ?? 5000}
                    userName="Your Name"
                    userHandle="@yourhandle"
                  />
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Media */}
      <div>
        <label className="block text-xs font-medium text-on-surface-variant uppercase tracking-wide mb-2">Media</label>
        <div className="rounded-xl bg-surface-container p-3 space-y-2">
          {mediaItems.length > 0 && (
            <div className="grid grid-cols-2 gap-2 mb-2">
              {mediaItems.map(media => (
                <div key={media.id} className="relative rounded-lg overflow-hidden bg-surface">
                  <img src={media.url} alt="media" className="w-full h-32 object-cover" />
                  <button
                    onClick={() => removeMediaItem(media.id)}
                    className="absolute top-1 right-1 bg-red-500/80 hover:bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold transition-colors"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          <button
            onClick={() => setShowImageModal(true)}
            className="w-full px-4 py-2 rounded-lg bg-surface text-on-surface font-label text-sm font-medium hover:bg-surface-container-high transition-colors border border-dashed border-on-surface-variant/30"
          >
            + Generate Image with AI
          </button>
        </div>
      </div>

      {/* AI Image Modal */}
      {showImageModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto space-y-4 p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-on-surface">AI Image Generation</h2>
              <button
                onClick={() => {
                  setShowImageModal(false)
                  setImageError('')
                  setGeneratedImageUrl('')
                }}
                className="text-on-surface-variant hover:text-on-surface transition-colors text-xl"
              >
                ×
              </button>
            </div>

            {/* Template Selector */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-on-surface-variant uppercase tracking-wide">Template (Optional)</label>
              <select
                value={selectedTemplate}
                onChange={(e) => {
                  const templateId = e.target.value
                  setSelectedTemplate(templateId)
                  if (templateId) {
                    const template = imageTemplates.find(t => t.id === templateId)
                    if (template) fillTemplatePrompt(template)
                  }
                }}
                disabled={templatesLoading}
                className="w-full rounded-xl bg-surface-container px-4 py-2.5 text-sm text-on-surface outline-none border border-transparent focus:border-outline-variant transition-colors"
              >
                <option value="">Choose a template...</option>
                {imageTemplates.map(template => (
                  <option key={template.id} value={template.id}>
                    {template.name} — {template.description}
                  </option>
                ))}
              </select>
            </div>

            {/* Image Prompt */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-on-surface-variant uppercase tracking-wide">Image Prompt</label>
              <textarea
                rows={4}
                value={imagePrompt}
                onChange={(e) => setImagePrompt(e.target.value)}
                placeholder="Describe the image you want to generate..."
                className="w-full rounded-xl bg-surface-container px-4 py-2.5 text-sm text-on-surface placeholder:text-on-surface-variant/50 outline-none border border-transparent focus:border-outline-variant transition-colors resize-none"
              />
              <p className="text-[10px] text-on-surface-variant">{imagePrompt.length} / 4000 characters</p>
            </div>

            {/* Provider & Size */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-xs font-medium text-on-surface-variant uppercase tracking-wide">Provider</label>
                <select
                  value={imageProvider}
                  onChange={(e) => setImageProvider(e.target.value as 'xai' | 'gemini')}
                  className="w-full rounded-xl bg-surface-container px-4 py-2.5 text-sm text-on-surface outline-none border border-transparent focus:border-outline-variant transition-colors"
                >
                  <option value="xai">xAI (Grok)</option>
                  <option value="gemini">Google Gemini</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-on-surface-variant uppercase tracking-wide">Size</label>
                <select
                  value={imageSize}
                  onChange={(e) => setImageSize(e.target.value as '1024x1024' | '1024x1536' | '1536x1024')}
                  className="w-full rounded-xl bg-surface-container px-4 py-2.5 text-sm text-on-surface outline-none border border-transparent focus:border-outline-variant transition-colors"
                >
                  <option value="1024x1024">Square (1024×1024)</option>
                  <option value="1024x1536">Portrait (1024×1536)</option>
                  <option value="1536x1024">Landscape (1536×1024)</option>
                </select>
              </div>
            </div>

            {/* Error */}
            {imageError && (
              <div className="px-4 py-3 rounded-xl bg-red-900/30 text-red-400 text-sm">
                {imageError}
              </div>
            )}

            {/* Generate Button */}
            <button
              onClick={handleGenerateImage}
              disabled={imageLoading || !imagePrompt.trim()}
              className="w-full px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-black font-label font-medium text-sm transition-colors"
            >
              {imageLoading ? 'Generating…' : 'Generate Image'}
            </button>

            {/* Preview */}
            {generatedImageUrl && (
              <div className="space-y-2">
                <label className="text-xs font-medium text-on-surface-variant uppercase tracking-wide">Preview</label>
                <div className="rounded-xl bg-surface-container overflow-hidden">
                  <img src={generatedImageUrl} alt="generated" className="w-full" />
                </div>
                {generatedPrompt && (
                  <div className="rounded-lg bg-surface p-2.5">
                    <p className="text-[10px] text-on-surface-variant font-medium mb-1">Revised Prompt:</p>
                    <p className="text-xs text-on-surface leading-relaxed">{generatedPrompt}</p>
                  </div>
                )}
                <button
                  onClick={handleUseImage}
                  className="w-full px-4 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white font-label font-medium text-sm transition-colors"
                >
                  Use This Image
                </button>
              </div>
            )}
          </div>
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
        <div className="flex items-end gap-2 mb-2">
          <div className="flex-1">
            <label className="block text-xs font-medium text-on-surface-variant uppercase tracking-wide mb-2">Schedule For</label>
            <input
              type="datetime-local"
              value={scheduledFor}
              min={minDateTime}
              onChange={(e) => setScheduledFor(e.target.value)}
              className="w-full rounded-xl bg-surface-container px-4 py-2.5 text-sm text-on-surface outline-none border border-transparent focus:border-outline-variant transition-colors"
            />
          </div>
          <button
            onClick={handleBestTime}
            disabled={bestTimeLoading}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface text-xs font-medium transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {bestTimeLoading ? (
              <span className="inline-block w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <span>✨</span>
            )}
            {bestTimeLoading ? 'Finding…' : 'Best time'}
          </button>
        </div>
        {scheduledFor && (
          <p className="text-xs text-on-surface-variant mb-2">
            {new Date(scheduledFor).toLocaleString()}
          </p>
        )}
        <p className="text-xs text-on-surface-variant">Leave empty to save as draft.</p>
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
