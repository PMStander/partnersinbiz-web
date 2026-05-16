import { render, screen } from '@testing-library/react'
import { RichTextBlock } from '@/components/client-documents/blocks/RichTextBlock'

const baseBlock = {
  id: 'r1',
  type: 'rich_text' as const,
  title: 'Notes',
  content: 'Free-form note.\nNew line preserved.',
  required: false,
  display: {},
}

test('renders title', () => {
  render(<RichTextBlock block={baseBlock} index={0} />)
  expect(screen.getByText('Notes')).not.toBeNull()
})

test('renders body text and preserves newlines via whitespace-pre-wrap', () => {
  const { container } = render(<RichTextBlock block={baseBlock} index={0} />)
  const body = container.querySelector('.whitespace-pre-wrap')
  expect(body).not.toBeNull()
  expect(body?.textContent).toContain('Free-form note.')
  expect(body?.textContent).toContain('New line preserved.')
})
