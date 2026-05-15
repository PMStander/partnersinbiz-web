'use client'

import type { CSSProperties } from 'react'

import type { ClientDocument, ClientDocumentVersion, DocumentBlock } from '@/lib/client-documents/types'

function readableType(type: string) {
  return type.replaceAll('_', ' ')
}

function blockContent(block: DocumentBlock) {
  if (typeof block.content === 'string') return block.content
  if (block.content && typeof block.content === 'object' && !Array.isArray(block.content)) {
    const body = (block.content as Record<string, unknown>).body
    if (typeof body === 'string') return body
  }
  return JSON.stringify(block.content, null, 2)
}

function renderBlock(block: DocumentBlock) {
  return (
    <section
      key={block.id}
      id={`block-${block.id}`}
      className="scroll-mt-24 border-b border-white/10 py-10"
      data-motion={block.display.motion ?? 'none'}
    >
      {block.title && <h2 className="mb-4 text-2xl font-semibold text-[var(--doc-accent)] md:text-4xl">{block.title}</h2>}
      <div className="whitespace-pre-wrap text-sm leading-7 text-white/80 md:text-base">{blockContent(block)}</div>
    </section>
  )
}

export function DocumentRenderer({
  document,
  version,
}: {
  document: ClientDocument
  version: ClientDocumentVersion
}) {
  const accent = version.theme?.palette?.accent ?? '#F5A623'
  const bg = version.theme?.palette?.bg ?? '#0A0A0B'
  const text = version.theme?.palette?.text ?? '#F7F4EE'
  const style = {
    '--doc-accent': accent,
    background: bg,
    color: text,
  } as CSSProperties

  return (
    <article className="min-h-screen" style={style}>
      <div className="mx-auto max-w-5xl px-5 py-12 md:px-10 md:py-16">
        <header className="flex min-h-[42vh] flex-col justify-end border-b border-white/10 pb-10">
          <p className="text-xs uppercase tracking-[0.2em] text-white/50">{readableType(document.type)}</p>
          <h1 className="mt-4 max-w-4xl text-5xl font-semibold leading-none md:text-7xl">{document.title}</h1>
          <p className="mt-6 text-sm text-white/50">Version {version.versionNumber}</p>
        </header>

        <div className="grid gap-10 md:grid-cols-[1fr_180px]">
          <div>{version.blocks.map(renderBlock)}</div>
          <aside className="hidden pt-10 md:block">
            <nav className="sticky top-24 space-y-2 text-xs text-white/50">
              {version.blocks.map((block) => (
                <a key={block.id} href={`#block-${block.id}`} className="block hover:text-[var(--doc-accent)]">
                  {block.title ?? readableType(block.type)}
                </a>
              ))}
            </nav>
          </aside>
        </div>
      </div>
    </article>
  )
}
