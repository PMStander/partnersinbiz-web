import type { DocumentBlock } from '@/lib/client-documents/types'
import { BlockFrame } from './BlockFrame'

type Provider = 'youtube' | 'loom' | 'vimeo' | 'mux'
type Content = { url: string; provider?: Provider; caption?: string }

function detectProvider(url: string): 'youtube' | 'loom' | 'vimeo' | 'unknown' {
  if (/youtu\.?be/.test(url)) return 'youtube'
  if (/loom\.com/.test(url)) return 'loom'
  if (/vimeo\.com/.test(url)) return 'vimeo'
  return 'unknown'
}

function embedUrl(url: string, provider: 'youtube' | 'loom' | 'vimeo' | 'mux' | 'unknown'): string {
  if (provider === 'youtube') {
    const m = url.match(/(?:v=|youtu\.be\/)([\w-]{11})/)
    return m ? `https://www.youtube.com/embed/${m[1]}` : url
  }
  if (provider === 'loom') {
    return url.replace('/share/', '/embed/')
  }
  if (provider === 'vimeo') {
    const m = url.match(/vimeo\.com\/(\d+)/)
    return m ? `https://player.vimeo.com/video/${m[1]}` : url
  }
  return url
}

export function VideoBlock({ block, index }: { block: DocumentBlock; index: number }) {
  const content = (block.content as Content) ?? { url: '' }
  const provider: 'youtube' | 'loom' | 'vimeo' | 'mux' | 'unknown' =
    content.provider ?? detectProvider(content.url)
  const src = embedUrl(content.url, provider)
  return (
    <BlockFrame block={block} index={index}>
      <figure>
        <div
          className="relative aspect-video overflow-hidden rounded-lg"
          style={{ border: '1px solid var(--doc-border)' }}
        >
          <iframe
            src={src}
            title={content.caption ?? 'Embedded video'}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            loading="lazy"
            className="absolute inset-0 h-full w-full"
          />
        </div>
        {content.caption && (
          <figcaption className="mt-2 text-center text-xs text-[var(--doc-muted)]">
            {content.caption}
          </figcaption>
        )}
      </figure>
    </BlockFrame>
  )
}
