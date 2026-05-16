'use client'

import { useEffect, type RefObject } from 'react'

/**
 * Fade-and-slide reveal motion for any descendant element marked with
 * `data-motion="reveal"` inside the given root. Elements start hidden
 * (opacity 0, translated down 24px) and animate in once they enter the
 * viewport. Re-runs whenever `dependencyKey` changes (typically the
 * document version id).
 */
export function useReveal(rootRef: RefObject<HTMLElement>, dependencyKey: unknown) {
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const els = root.querySelectorAll('[data-motion="reveal"]') as NodeListOf<HTMLElement>
    if (els.length === 0) return

    els.forEach((el) => {
      el.style.opacity = '0'
      el.style.transform = 'translateY(24px)'
    })

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const el = entry.target as HTMLElement
            el.style.opacity = '1'
            el.style.transform = 'translateY(0)'
            el.style.transition = 'opacity 0.55s ease, transform 0.55s ease'
            observer.unobserve(el)
          }
        })
      },
      { threshold: 0.15 },
    )

    els.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [rootRef, dependencyKey])
}
