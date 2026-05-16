import { render, screen } from '@testing-library/react'
import { SummaryBlock } from '@/components/client-documents/blocks/SummaryBlock'

const baseBlock = {
  id: 's1',
  type: 'summary' as const,
  title: 'Executive Summary',
  content: 'This proposal outlines the engagement scope and value.',
  required: true,
  display: {},
}

test('renders title', () => {
  render(<SummaryBlock block={baseBlock} index={0} />)
  expect(screen.getByText('Executive Summary')).not.toBeNull()
})

test('renders body text', () => {
  render(<SummaryBlock block={baseBlock} index={0} />)
  expect(
    screen.getByText('This proposal outlines the engagement scope and value.'),
  ).not.toBeNull()
})

test('body has drop-cap CSS classes', () => {
  const { container } = render(<SummaryBlock block={baseBlock} index={0} />)
  const p = container.querySelector('p.first-letter\\:float-left')
  expect(p).not.toBeNull()
  // accent drop-cap
  expect(p?.className).toMatch(/first-letter:text-\[var\(--doc-accent\)\]/)
})
