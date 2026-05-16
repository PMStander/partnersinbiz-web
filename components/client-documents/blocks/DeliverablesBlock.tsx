import type { DocumentBlock } from '@/lib/client-documents/types'
import { BlockFrame } from './BlockFrame'
import { SparkleIcon } from './_icons'

export function DeliverablesBlock({
  block,
  index,
}: {
  block: DocumentBlock
  index: number
}) {
  const items = Array.isArray(block.content) ? (block.content as string[]) : []
  return (
    <BlockFrame block={block} index={index}>
      {block.title && (
        <h2 className="mb-6 text-2xl font-semibold text-[var(--doc-accent)] md:text-4xl">
          {block.title}
        </h2>
      )}
      <ul className="space-y-4">
        {items.map((item, i) => (
          <li
            key={i}
            className="flex items-start gap-4 text-base leading-7 text-[var(--doc-text)] md:text-lg"
          >
            <SparkleIcon
              className="mt-1 h-4 w-4 shrink-0"
              style={{ color: 'var(--doc-accent)' }}
            />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </BlockFrame>
  )
}
