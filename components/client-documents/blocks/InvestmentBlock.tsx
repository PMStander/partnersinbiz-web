import type { DocumentBlock } from '@/lib/client-documents/types'
import { BlockFrame } from './BlockFrame'

type Item = { label: string; amount: number; currency?: string }
type Content = { items: Item[]; total: number; currency?: string; notes?: string }

function formatMoney(amount: number, currency = 'ZAR') {
  try {
    return new Intl.NumberFormat('en-ZA', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount)
  } catch {
    return `${currency} ${amount.toLocaleString()}`
  }
}

export function InvestmentBlock({ block, index }: { block: DocumentBlock; index: number }) {
  const content = (block.content as Content) ?? { items: [], total: 0 }
  const items = content.items ?? []
  const total = content.total ?? 0
  const currency = content.currency ?? 'ZAR'

  return (
    <BlockFrame block={block} index={index}>
      {block.title && (
        <h2 className="mb-8 text-2xl font-semibold text-[var(--doc-accent)] md:text-4xl">
          {block.title}
        </h2>
      )}
      <div
        className="rounded-2xl border p-6 md:p-8"
        style={{ borderColor: 'var(--doc-border)', background: 'var(--doc-surface)' }}
      >
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--doc-muted)]">
          Total investment
        </p>
        <p
          className="mt-2 text-4xl font-semibold md:text-6xl"
          style={{ color: 'var(--doc-accent)' }}
          data-counter={total}
        >
          {formatMoney(total, currency)}
        </p>

        <table className="mt-8 w-full text-sm">
          <tbody>
            {items.map((item, i) => (
              <tr key={i} className="border-t" style={{ borderColor: 'var(--doc-border)' }}>
                <td className="py-3 pr-4 text-[var(--doc-text)]">{item.label}</td>
                <td className="py-3 text-right tabular-nums text-[var(--doc-text)] opacity-80">
                  {formatMoney(item.amount, currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {content.notes && (
          <p className="mt-6 text-xs leading-5 text-[var(--doc-muted)]">{content.notes}</p>
        )}
      </div>
    </BlockFrame>
  )
}
