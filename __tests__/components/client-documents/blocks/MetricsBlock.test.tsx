import { render, screen } from '@testing-library/react'
import { MetricsBlock } from '@/components/client-documents/blocks/MetricsBlock'

const baseBlock = {
  id: 'm1',
  type: 'metrics' as const,
  title: 'Outcomes',
  content: {
    items: [
      { label: 'Revenue', value: '+45%', target: '+30%', description: 'Year over year growth' },
      { label: 'Conversions', value: '12.4%' },
      { label: 'Visitors', value: '210k', target: '180k' },
    ],
  },
  required: true,
  display: {},
}

test('renders title and all items', () => {
  render(<MetricsBlock block={baseBlock} index={0} />)
  expect(screen.getByText('Outcomes')).not.toBeNull()
  expect(screen.getByText('Revenue')).not.toBeNull()
  expect(screen.getByText('Conversions')).not.toBeNull()
  expect(screen.getByText('Visitors')).not.toBeNull()
  expect(screen.getByText('+45%')).not.toBeNull()
  expect(screen.getByText('12.4%')).not.toBeNull()
})

test('renders target text when set', () => {
  render(<MetricsBlock block={baseBlock} index={0} />)
  expect(screen.getByText(/Target: \+30%/)).not.toBeNull()
  expect(screen.getByText(/Target: 180k/)).not.toBeNull()
})

test('sets data-counter on each value', () => {
  const { container } = render(<MetricsBlock block={baseBlock} index={0} />)
  const counters = container.querySelectorAll('[data-counter]')
  expect(counters.length).toBe(3)
  expect(counters[0]?.getAttribute('data-counter')).toBe('+45%')
})

test('renders description when present', () => {
  render(<MetricsBlock block={baseBlock} index={0} />)
  expect(screen.getByText('Year over year growth')).not.toBeNull()
})
