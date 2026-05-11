'use client'

import type { BlockType } from '@/lib/email-builder/types'

const ICONS: Record<BlockType, string> = {
  hero: 'H',
  heading: 'T',
  paragraph: '¶',
  button: '◉',
  image: '▣',
  divider: '─',
  spacer: '↕',
  columns: '◫',
  footer: '⌐',
}

const LABELS: Record<BlockType, string> = {
  hero: 'Hero',
  heading: 'Heading',
  paragraph: 'Paragraph',
  button: 'Button',
  image: 'Image',
  divider: 'Divider',
  spacer: 'Spacer',
  columns: 'Columns',
  footer: 'Footer',
}

export function BlockIcon({ type, className = '' }: { type: BlockType; className?: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center w-7 h-7 rounded-md bg-zinc-800 text-zinc-200 text-sm font-bold ${className}`}
      aria-hidden="true"
    >
      {ICONS[type]}
    </span>
  )
}

export function blockLabel(type: BlockType): string {
  return LABELS[type]
}
