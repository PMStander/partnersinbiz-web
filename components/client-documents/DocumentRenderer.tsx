'use client'

import { useEffect, useRef, useState } from 'react'
import type { ClientDocument, ClientDocumentVersion } from '@/lib/client-documents/types'
import { DocumentTheme } from './theme/DocumentTheme'
import { getRenderer } from './blocks'
import { useReveal } from './motion/useReveal'
import { useCounter } from './motion/useCounter'

function readableType(type: string) {
  return type.replaceAll('_', ' ')
}

export function DocumentRenderer({
  document: clientDoc,
  version,
}: {
  document: ClientDocument
  version: ClientDocumentVersion
}) {
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const articleRef = useRef<HTMLElement>(null)

  // Fade-and-slide reveal on scroll into view for [data-motion="reveal"] elements.
  useReveal(articleRef, version.id)

  // Animate numeric values up from 0 for every [data-counter] element.
  useCounter(articleRef, version.id)

  // Active sticky-nav tracking
  useEffect(() => {
    const root = articleRef.current
    if (!root) return
    const sections = version.blocks
      .map((b) => root.querySelector(`#block-${b.id}`))
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

  // Reading progress
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
    <DocumentTheme palette={version.theme?.palette}>
      <div
        className="fixed top-0 left-0 z-50 h-[2px] transition-[width] duration-100"
        style={{ width: `${progress}%`, background: 'var(--doc-accent)' }}
        aria-hidden
      />

      <article ref={articleRef} className="min-h-screen">
        <div className="mx-auto max-w-5xl px-5 py-12 md:px-10 md:py-16">
          <header className="flex min-h-[42vh] flex-col justify-end border-b border-[var(--doc-border)] pb-10">
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--doc-muted)]">
              {readableType(clientDoc.type)}
            </p>
            <h1 className="mt-4 max-w-4xl text-5xl font-semibold leading-none md:text-7xl">
              {clientDoc.title}
            </h1>
            <p className="mt-6 text-sm text-[var(--doc-muted)]">
              Version {version.versionNumber}
            </p>
          </header>

          <div className="grid gap-10 md:grid-cols-[1fr_180px]">
            <div>
              {version.blocks.map((block, index) => {
                const Renderer = getRenderer(block.type)
                return <Renderer key={block.id} block={block} index={index} />
              })}
            </div>
            <aside className="hidden pt-10 md:block">
              <nav className="sticky top-24 space-y-1 text-xs text-[var(--doc-muted)]">
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
    </DocumentTheme>
  )
}
