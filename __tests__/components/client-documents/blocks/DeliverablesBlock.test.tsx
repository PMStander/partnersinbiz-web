import { render, screen } from '@testing-library/react'
import { DeliverablesBlock } from '@/components/client-documents/blocks/DeliverablesBlock'

const baseBlock = {
  id: 'd1',
  type: 'deliverables' as const,
  title: 'What you get',
  content: ['Brand audit', '12-week content calendar', 'Quarterly review'],
  required: true,
  display: {},
}

test('renders title', () => {
  render(<DeliverablesBlock block={baseBlock} index={0} />)
  expect(screen.getByText('What you get')).not.toBeNull()
})

test('renders each deliverable item', () => {
  render(<DeliverablesBlock block={baseBlock} index={0} />)
  expect(screen.getByText('Brand audit')).not.toBeNull()
  expect(screen.getByText('12-week content calendar')).not.toBeNull()
  expect(screen.getByText('Quarterly review')).not.toBeNull()
})

test('renders sparkle icon per item', () => {
  const { container } = render(<DeliverablesBlock block={baseBlock} index={0} />)
  const svgs = container.querySelectorAll('svg')
  expect(svgs.length).toBe(3)
})
