import { render } from '@testing-library/react'
import { BlockFrame } from '@/components/client-documents/blocks/BlockFrame'

const block = {
  id: 'b1',
  type: 'summary' as const,
  content: 'x',
  required: true,
  display: { motion: 'reveal' as const },
}

test('renders section with scroll anchor id', () => {
  const { container } = render(
    <BlockFrame block={block} index={0}>
      <p>child</p>
    </BlockFrame>,
  )
  const section = container.querySelector('section')
  expect(section).not.toBeNull()
  expect(section?.id).toBe('block-b1')
})

test('sets data-motion attribute from block.display.motion', () => {
  const { container } = render(
    <BlockFrame block={block} index={0}>
      <p>x</p>
    </BlockFrame>,
  )
  expect(container.querySelector('section')?.dataset.motion).toBe('reveal')
})

test('falls back to data-motion="none" when motion is missing', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b = { ...block, display: {} } as any
  const { container } = render(
    <BlockFrame block={b} index={0}>
      <span />
    </BlockFrame>,
  )
  expect(container.querySelector('section')?.dataset.motion).toBe('none')
})
