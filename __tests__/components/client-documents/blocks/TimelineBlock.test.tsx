import { render, screen } from '@testing-library/react'
import { TimelineBlock } from '@/components/client-documents/blocks/TimelineBlock'

const baseBlock = {
  id: 't1',
  type: 'timeline' as const,
  title: 'Project timeline',
  content: {
    phases: [
      { label: 'Discovery', duration: 'Week 1-2', description: 'Brand audit and research' },
      { label: 'Build', duration: 'Week 3-6' },
      { label: 'Launch', duration: 'Week 7', description: 'Go live' },
    ],
  },
  required: true,
  display: {},
}

test('renders title', () => {
  render(<TimelineBlock block={baseBlock} index={0} />)
  expect(screen.getByText('Project timeline')).not.toBeNull()
})

test('renders all phases with numbered callouts', () => {
  render(<TimelineBlock block={baseBlock} index={0} />)
  expect(screen.getByText('Discovery')).not.toBeNull()
  expect(screen.getByText('Build')).not.toBeNull()
  expect(screen.getByText('Launch')).not.toBeNull()
  expect(screen.getByText('01')).not.toBeNull()
  expect(screen.getByText('02')).not.toBeNull()
  expect(screen.getByText('03')).not.toBeNull()
  expect(screen.getByText('Week 1-2')).not.toBeNull()
  expect(screen.getByText('Week 3-6')).not.toBeNull()
  expect(screen.getByText('Week 7')).not.toBeNull()
})

test('renders descriptions when present', () => {
  render(<TimelineBlock block={baseBlock} index={0} />)
  expect(screen.getByText('Brand audit and research')).not.toBeNull()
  expect(screen.getByText('Go live')).not.toBeNull()
})
