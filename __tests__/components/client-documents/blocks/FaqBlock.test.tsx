import { render } from '@testing-library/react'
import { FaqBlock } from '@/components/client-documents/blocks/FaqBlock'

const baseBlock = {
  id: 'faq1',
  type: 'faq' as const,
  title: 'Frequently asked questions',
  content: {
    items: [
      { q: 'When can we start?', a: 'Within a week of acceptance.' },
      { q: 'How are revisions handled?', a: 'Two rounds included per phase.' },
      { q: 'What about cancellation?', a: 'Either party can cancel with 30 days notice.' },
    ],
  },
  required: false,
  display: {},
}

test('renders the section title', () => {
  const { container } = render(<FaqBlock block={baseBlock} index={0} />)
  expect(container.textContent).toContain('Frequently asked questions')
})

test('renders all questions and answers', () => {
  const { container } = render(<FaqBlock block={baseBlock} index={0} />)
  expect(container.textContent).toContain('When can we start?')
  expect(container.textContent).toContain('Within a week of acceptance.')
  expect(container.textContent).toContain('How are revisions handled?')
  expect(container.textContent).toContain('Two rounds included per phase.')
  expect(container.textContent).toContain('What about cancellation?')
})

test('uses native <details>/<summary> accordion (one per item)', () => {
  const { container } = render(<FaqBlock block={baseBlock} index={0} />)
  const detailsEls = container.querySelectorAll('details')
  expect(detailsEls.length).toBe(3)
  const summaries = container.querySelectorAll('summary')
  expect(summaries.length).toBe(3)
})

test('handles missing items gracefully', () => {
  const block = {
    id: 'faq2',
    type: 'faq' as const,
    title: 'FAQ',
    content: {},
    required: false,
    display: {},
  }
  const { container } = render(<FaqBlock block={block} index={0} />)
  expect(container.querySelectorAll('details').length).toBe(0)
})
