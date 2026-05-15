'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'

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
  document: clientDoc,
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

  const [activeBlockId, setActiveBlockId] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const articleRef = useRef<HTMLElement>(null)

  // Scroll-driven reveal animations
  useEffect(() => {
    const els = globalThis.document.querySelectorAll('[data-motion]') as NodeListOf<HTMLElement>
    const toReveal = new Set<HTMLElement>()

    els.forEach((el) => {
      if (el.dataset.motion && el.dataset.motion !== 'none') {
        el.style.opacity = '0'
        el.style.transform = 'translateY(24px)'
        toReveal.add(el)
      }
    })

    if (toReveal.size === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const el = entry.target as HTMLElement
            el.style.opacity = '1'
            el.style.transform = 'translateY(0)'
            el.style.transition = 'opacity 0.55s ease, transform 0.55s ease'
            toReveal.delete(el)
            observer.unobserve(el)
            if (toReveal.size === 0) observer.disconnect()
          }
        })
      },
      { threshold: 0.15 },
    )

    toReveal.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [clientDoc, version.id])

  // Active nav block tracking
  useEffect(() => {
    const sections = version.blocks
      .map((b) => globalThis.document?.getElementById(`block-${b.id}`))
      .filter(Boolean) as HTMLElement[]

    if (sections.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const blockId = entry.target.id.replace('block-', '')
            setActiveBlockId(blockId)
          }
        })
      },
      { rootMargin: '-30% 0px -60% 0px', threshold: 0 },
    )

    sections.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [version.blocks])

  // Reading progress bar
  useEffect(() => {
    function onScroll() {
      const scrolled = window.scrollY
      const total = globalThis.document.body.scrollHeight - window.innerHeight
      setProgress(total > 0 ? (scrolled / total) * 100 : 0)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <>
      {/* Reading progress bar */}
      <div
        className="fixed top-0 left-0 z-50 h-[2px] transition-[width] duration-100"
        style={{ width: `${progress}%`, background: accent }}
        aria-hidden
      />

      <article ref={articleRef} className="min-h-screen" style={style}>
        <div className="mx-auto max-w-5xl px-5 py-12 md:px-10 md:py-16">
          <header className="flex min-h-[42vh] flex-col justify-end border-b border-white/10 pb-10">
            <p className="text-xs uppercase tracking-[0.2em] text-white/50">{readableType(clientDoc.type)}</p>
            <h1 className="mt-4 max-w-4xl text-5xl font-semibold leading-none md:text-7xl">{clientDoc.title}</h1>
            <p className="mt-6 text-sm text-white/50">Version {version.versionNumber}</p>
          </header>

          <div className="grid gap-10 md:grid-cols-[1fr_180px]">
            <div>{version.blocks.map(renderBlock)}</div>
            <aside className="hidden pt-10 md:block">
              <nav className="sticky top-24 space-y-1 text-xs text-white/50">
                {version.blocks.map((block) => {
                  const isActive = activeBlockId === block.id
                  return (
                    <a
                      key={block.id}
                      href={`#block-${block.id}`}
                      className={[
                        'block border-l-2 pl-3 py-0.5 transition-colors duration-200',
                        isActive
                          ? 'border-[var(--doc-accent)] text-[var(--doc-accent)]'
                          : 'border-transparent hover:text-[var(--doc-accent)]',
                      ].join(' ')}
                    >
                      {block.title ?? readableType(block.type)}
                    </a>
                  )
                })}
              </nav>
            </aside>
          </div>
        </div>
      </article>
    </>
  )
}
