import { render, screen } from '@testing-library/react'
import { ProblemBlock } from '@/components/client-documents/blocks/ProblemBlock'

const baseBlock = {
  id: 'p1',
  type: 'problem' as const,
  title: 'The Problem',
  content: 'Sales teams are flying blind without clear pipeline visibility.',
  required: true,
  display: {},
}

test('renders title', () => {
  render(<ProblemBlock block={baseBlock} index={0} />)
  expect(screen.getByText('The Problem')).not.toBeNull()
})

test('renders body text', () => {
  render(<ProblemBlock block={baseBlock} index={0} />)
  expect(
    screen.getByText('Sales teams are flying blind without clear pipeline visibility.'),
  ).not.toBeNull()
})

test('body wrapped in left-border-accent container', () => {
  const { container } = render(<ProblemBlock block={baseBlock} index={0} />)
  const wrap = container.querySelector('.border-l-2.pl-6')
  expect(wrap).not.toBeNull()
  expect((wrap as HTMLElement).style.borderColor).toBe('var(--doc-accent)')
})
