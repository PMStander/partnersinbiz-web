import type { DocumentBlock } from '@/lib/client-documents/types'
import { BlockFrame } from './BlockFrame'

type Content = {
  url: string
  alt?: string
  caption?: string
  width?: 'normal' | 'wide' | 'full'
}

const WIDTHS = {
  normal: 'max-w-full',
  wide: 'max-w-[110%] -mx-[5%]',
  full: 'max-w-[140%] -mx-[20%]',
} as const

export function ImageBlock({ block, index }: { block: DocumentBlock; index: number }) {
  const content = (block.content as Content) ?? { url: '' }
  const cls = WIDTHS[content.width ?? 'normal']
  return (
    <BlockFrame block={block} index={index}>
      <figure className={cls}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={content.url}
          alt={content.alt ?? ''}
          loading="lazy"
          className="w-full rounded-lg"
          style={{ border: '1px solid var(--doc-accent-soft)' }}
        />
        {content.caption && (
          <figcaption className="mt-2 text-center text-xs text-[var(--doc-muted)]">
            {content.caption}
          </figcaption>
        )}
      </figure>
    </BlockFrame>
  )
}
