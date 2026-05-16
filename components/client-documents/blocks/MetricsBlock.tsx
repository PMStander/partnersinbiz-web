import type { DocumentBlock } from '@/lib/client-documents/types'
import { BlockFrame } from './BlockFrame'

type MetricItem = { label: string; value?: string; target?: string; description?: string }

export function MetricsBlock({ block, index }: { block: DocumentBlock; index: number }) {
  const items: MetricItem[] = ((block.content as { items?: MetricItem[] } | null)?.items) ?? []
  return (
    <BlockFrame block={block} index={index}>
      {block.title && (
        <h2 className="mb-8 text-2xl font-semibold text-[var(--doc-accent)] md:text-4xl">
          {block.title}
        </h2>
      )}
      <div className="grid gap-4 md:grid-cols-3">
        {items.map((item, i) => (
          <div
            key={i}
            className="rounded-xl border p-5"
            style={{ borderColor: 'var(--doc-border)', background: 'var(--doc-surface)' }}
          >
            <p className="text-xs uppercase tracking-wider text-[var(--doc-muted)]">
              {item.label}
            </p>
            {item.value && (
              <p
                className="mt-3 text-3xl font-semibold md:text-4xl"
                style={{ color: 'var(--doc-accent)' }}
                data-counter={item.value}
              >
                {item.value}
              </p>
            )}
            {item.target && (
              <p className="mt-1 text-xs text-[var(--doc-muted)]">Target: {item.target}</p>
            )}
            {item.description && (
              <p className="mt-2 text-sm text-[var(--doc-text)] opacity-80">{item.description}</p>
            )}
          </div>
        ))}
      </div>
    </BlockFrame>
  )
}
