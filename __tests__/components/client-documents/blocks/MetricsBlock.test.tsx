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

test('renders a progress ring when both value and target are numeric', () => {
  const { container } = render(<MetricsBlock block={baseBlock} index={0} />)
  // Revenue (+45% / +30%) and Visitors (210k / 180k) both qualify.
  const ringRows = container.querySelectorAll('[data-testid="metric-ring-row"]')
  expect(ringRows.length).toBe(2)
  // Each ring row should contain an SVG circle for the track and progress arc.
  ringRows.forEach((row) => {
    expect(row.querySelector('svg')).not.toBeNull()
    expect(row.querySelectorAll('circle').length).toBe(2)
  })
})

test('does not render a ring when there is no target', () => {
  const block = {
    id: 'm2',
    type: 'metrics' as const,
    content: {
      items: [{ label: 'Conversions', value: '12.4%' }],
    },
    required: true,
    display: {},
  }
  const { container } = render(<MetricsBlock block={block} index={0} />)
  expect(container.querySelectorAll('[data-testid="metric-ring-row"]').length).toBe(0)
  expect(container.querySelector('svg')).toBeNull()
})

test('does not render a ring when value is non-numeric', () => {
  const block = {
    id: 'm3',
    type: 'metrics' as const,
    content: {
      items: [{ label: 'Net Promoter', value: 'high', target: 'industry leader' }],
    },
    required: true,
    display: {},
  }
  const { container } = render(<MetricsBlock block={block} index={0} />)
  expect(container.querySelectorAll('[data-testid="metric-ring-row"]').length).toBe(0)
})
