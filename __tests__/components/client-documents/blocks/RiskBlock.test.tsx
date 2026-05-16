import { render, screen } from '@testing-library/react'
import { RiskBlock } from '@/components/client-documents/blocks/RiskBlock'

test('renders title and array of risks', () => {
  const block = {
    id: 'r1',
    type: 'risk' as const,
    title: 'Risks',
    content: ['Scope creep', 'Stakeholder availability', 'Vendor lock-in'],
    required: false,
    display: {},
  }
  render(<RiskBlock block={block} index={0} />)
  expect(screen.getByText('Risks')).not.toBeNull()
  expect(screen.getByText('Scope creep')).not.toBeNull()
  expect(screen.getByText('Stakeholder availability')).not.toBeNull()
  expect(screen.getByText('Vendor lock-in')).not.toBeNull()
})

test('normalizes a single string into one item', () => {
  const block = {
    id: 'r2',
    type: 'risk' as const,
    title: 'Risks',
    content: 'Single risk text',
    required: false,
    display: {},
  }
  const { container } = render(<RiskBlock block={block} index={0} />)
  expect(screen.getByText('Single risk text')).not.toBeNull()
  expect(container.querySelectorAll('li').length).toBe(1)
})

test('renders each risk as a list item with amber border style', () => {
  const block = {
    id: 'r3',
    type: 'risk' as const,
    title: 'Risks',
    content: ['One', 'Two'],
    required: false,
    display: {},
  }
  const { container } = render(<RiskBlock block={block} index={0} />)
  const items = container.querySelectorAll('li')
  expect(items.length).toBe(2)
  // JSDOM normalizes #f59e0b to rgb(245, 158, 11)
  expect(items[0]?.getAttribute('style') ?? '').toMatch(/245,\s*158,\s*11/)
})
