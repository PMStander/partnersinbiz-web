import { render, screen } from '@testing-library/react'
import { CalloutBlock } from '@/components/client-documents/blocks/CalloutBlock'

test('renders content title and body with default info variant color', () => {
  const block = {
    id: 'c1',
    type: 'callout' as const,
    title: '',
    content: { title: 'Heads up', body: 'This is important.' },
    required: false,
    display: {},
  }
  const { container } = render(<CalloutBlock block={block} index={0} />)
  expect(screen.getByText('Heads up')).not.toBeNull()
  expect(screen.getByText('This is important.')).not.toBeNull()
  // default info color = #3b82f6 → rgb(59, 130, 246)
  const wrapper = container.querySelector('div[style*="border"]')
  expect(wrapper?.getAttribute('style') ?? '').toMatch(/59,\s*130,\s*246/)
})

test('uses warning variant color when set', () => {
  const block = {
    id: 'c2',
    type: 'callout' as const,
    title: '',
    content: { title: 'Warning', body: 'Caution', variant: 'warning' as const },
    required: false,
    display: {},
  }
  const { container } = render(<CalloutBlock block={block} index={0} />)
  // warning #f59e0b → rgb(245, 158, 11)
  const wrapper = container.querySelector('div[style*="border"]')
  expect(wrapper?.getAttribute('style') ?? '').toMatch(/245,\s*158,\s*11/)
})

test('uses success variant color when set', () => {
  const block = {
    id: 'c3',
    type: 'callout' as const,
    title: '',
    content: { title: 'Done', body: 'Shipped', variant: 'success' as const },
    required: false,
    display: {},
  }
  const { container } = render(<CalloutBlock block={block} index={0} />)
  // success #10b981 → rgb(16, 185, 129)
  const wrapper = container.querySelector('div[style*="border"]')
  expect(wrapper?.getAttribute('style') ?? '').toMatch(/16,\s*185,\s*129/)
})
