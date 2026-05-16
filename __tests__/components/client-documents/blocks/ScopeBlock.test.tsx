import { render, screen } from '@testing-library/react'
import { ScopeBlock } from '@/components/client-documents/blocks/ScopeBlock'

const baseList = {
  id: 'sc1',
  type: 'scope' as const,
  title: 'In Scope',
  content: ['Audit', 'Strategy', 'Implementation'],
  required: true,
  display: {},
}

const baseProse = {
  id: 'sc2',
  type: 'scope' as const,
  title: 'Scope',
  content: 'A single paragraph describing scope.',
  required: true,
  display: {},
}

test('renders title', () => {
  render(<ScopeBlock block={baseList} index={0} />)
  expect(screen.getByText('In Scope')).not.toBeNull()
})

test('renders list mode items with check icons', () => {
  const { container } = render(<ScopeBlock block={baseList} index={0} />)
  expect(screen.getByText('Audit')).not.toBeNull()
  expect(screen.getByText('Strategy')).not.toBeNull()
  expect(screen.getByText('Implementation')).not.toBeNull()
  // 3 SVGs (one per item)
  const svgs = container.querySelectorAll('svg')
  expect(svgs.length).toBe(3)
})

test('renders prose mode for string content', () => {
  render(<ScopeBlock block={baseProse} index={0} />)
  expect(screen.getByText('A single paragraph describing scope.')).not.toBeNull()
})
