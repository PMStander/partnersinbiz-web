'use client'

import { useEffect, type RefObject } from 'react'

/**
 * Animates the numeric portion of every `[data-counter]` element inside
 * the given root from 0 up to `Number(dataset.counter)` once the element
 * scrolls into view. Uses cubic easing over ~900ms. Preserves any
 * non-numeric prefix or suffix (currency symbols, %, etc.) by replacing
 * only the matched numeric run inside `textContent`.
 *
 * Re-runs whenever `dependencyKey` changes (typically the document
 * version id).
 */
export function useCounter(rootRef: RefObject<HTMLElement>, dependencyKey: unknown) {
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const els = root.querySelectorAll('[data-counter]') as NodeListOf<HTMLElement>
    if (els.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return
          const el = entry.target as HTMLElement
          const finalText = el.textContent ?? ''
          const target = Number(el.dataset.counter)
          if (!isFinite(target)) return
          const duration = 900
          const start = performance.now()
          function tick(now: number) {
            const t = Math.min(1, (now - start) / duration)
            const eased = 1 - Math.pow(1 - t, 3)
            const current = Math.round(target * eased)
            // Preserve any prefix/suffix by only replacing the numeric run.
            el.textContent = finalText.replace(/[\d,]+/, current.toLocaleString())
            if (t < 1) requestAnimationFrame(tick)
            else el.textContent = finalText
          }
          requestAnimationFrame(tick)
          observer.unobserve(el)
        })
      },
      { threshold: 0.4 },
    )

    els.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [rootRef, dependencyKey])
}
