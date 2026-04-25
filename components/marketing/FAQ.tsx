'use client'

import { useState } from 'react'

interface Item { q: string; a: string }

export function FAQ({ items }: { items: readonly Item[] | Item[] }) {
  const [open, setOpen] = useState<number | null>(0)
  return (
    <ul className="divide-y divide-[var(--color-pib-line)] border-y border-[var(--color-pib-line)]">
      {items.map((item, i) => {
        const isOpen = open === i
        return (
          <li key={item.q}>
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : i)}
              className="w-full flex items-start gap-6 justify-between text-left py-6 group"
            >
              <span className="text-lg md:text-xl font-medium text-[var(--color-pib-text)] group-hover:text-[var(--color-pib-accent)] transition-colors text-balance">
                {item.q}
              </span>
              <span className={`material-symbols-outlined mt-0.5 text-[var(--color-pib-text-muted)] transition-transform duration-300 ${isOpen ? 'rotate-45' : ''}`}>add</span>
            </button>
            <div
              className="grid transition-all duration-300 ease-out"
              style={{ gridTemplateRows: isOpen ? '1fr' : '0fr' }}
            >
              <div className="overflow-hidden">
                <p className="pb-6 pr-12 text-[var(--color-pib-text-muted)] leading-relaxed max-w-3xl">
                  {item.a}
                </p>
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
