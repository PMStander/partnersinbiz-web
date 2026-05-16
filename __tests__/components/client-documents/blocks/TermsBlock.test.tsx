import { render, screen } from '@testing-library/react'
import { TermsBlock } from '@/components/client-documents/blocks/TermsBlock'

const baseBlock = {
  id: 't1',
  type: 'terms' as const,
  title: 'Terms & Conditions',
  content: 'Payment is due within 14 days of invoice issue.',
  required: true,
  display: {},
}

test('renders title', () => {
  render(<TermsBlock block={baseBlock} index={0} />)
  expect(screen.getByText('Terms & Conditions')).not.toBeNull()
})

test('renders body text', () => {
  render(<TermsBlock block={baseBlock} index={0} />)
  expect(screen.getByText('Payment is due within 14 days of invoice issue.')).not.toBeNull()
})

test('body uses muted color and prose width', () => {
  const { container } = render(<TermsBlock block={baseBlock} index={0} />)
  const body = container.querySelector('.max-w-prose')
  expect(body).not.toBeNull()
  expect(body?.className).toMatch(/text-\[var\(--doc-muted\)\]/)
})
