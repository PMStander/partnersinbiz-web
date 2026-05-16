'use client'
import type { DocumentBlock } from '@/lib/client-documents/types'

type Provider = 'youtube' | 'loom' | 'vimeo' | 'mux'
type Content = { url: string; provider?: Provider; caption?: string }

const PROVIDERS: Provider[] = ['youtube', 'loom', 'vimeo', 'mux']

export function VideoEditor({
  block,
  onChange,
}: {
  block: DocumentBlock
  onChange: (b: DocumentBlock) => void
}) {
  const content = (block.content as Content) ?? { url: '' }

  const update = (patch: Partial<Content>) => {
    onChange({ ...block, content: { ...content, ...patch } })
  }

  const providerValue = content.provider ?? ''

  return (
    <div className="space-y-2">
      <input
        type="text"
        value={block.title ?? ''}
        onChange={(e) => onChange({ ...block, title: e.target.value })}
        placeholder="Block title (optional, for editor reference)"
        className="w-full rounded border border-[var(--color-pib-line)] bg-transparent px-3 py-2 text-sm"
      />
      <input
        type="url"
        value={content.url}
        onChange={(e) => update({ url: e.target.value })}
        placeholder="Video URL (YouTube, Loom, Vimeo)"
        className="w-full rounded border border-[var(--color-pib-line)] bg-transparent px-3 py-2 text-sm"
      />
      <div className="flex items-center gap-2">
        <label className="text-xs uppercase tracking-wider opacity-70">Provider</label>
        <select
          value={providerValue}
          onChange={(e) => {
            const value = e.target.value
            if (value === '') {
              const { provider: _unused, ...rest } = content
              onChange({ ...block, content: rest })
            } else {
              update({ provider: value as Provider })
            }
          }}
          className="rounded border border-[var(--color-pib-line)] bg-transparent px-2 py-1 text-sm"
        >
          <option value="">auto-detect</option>
          {PROVIDERS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>
      <input
        type="text"
        value={content.caption ?? ''}
        onChange={(e) => update({ caption: e.target.value })}
        placeholder="Caption (optional)"
        className="w-full rounded border border-[var(--color-pib-line)] bg-transparent px-3 py-2 text-sm"
      />
    </div>
  )
}
