import { render } from '@testing-library/react'
import { ChartBlock } from '@/components/client-documents/blocks/ChartBlock'

test('returns null when content.kind missing', () => {
  const block = {
    id: 'c0',
    type: 'chart' as const,
    title: '',
    content: {},
    required: false,
    display: {},
  }
  const { container } = render(<ChartBlock block={block} index={0} />)
  expect(container.querySelector('section')).toBeNull()
})

test('renders bar chart wrapper for kind=bar', () => {
  const block = {
    id: 'c1',
    type: 'chart' as const,
    title: 'Revenue by month',
    content: {
      kind: 'bar' as const,
      data: [
        { name: 'Jan', value: 12 },
        { name: 'Feb', value: 18 },
      ],
    },
    required: false,
    display: {},
  }
  const { container } = render(<ChartBlock block={block} index={0} />)
  expect(container.querySelector('section')).not.toBeNull()
  // Recharts always renders its wrapper div, even when JSDOM cannot measure dimensions
  expect(container.querySelector('.recharts-responsive-container')).not.toBeNull()
  expect(container.textContent).toContain('Revenue by month')
})

test('renders pie chart wrapper for kind=pie', () => {
  const block = {
    id: 'c2',
    type: 'chart' as const,
    title: '',
    content: {
      kind: 'pie' as const,
      data: [
        { name: 'Organic', value: 60 },
        { name: 'Paid', value: 40 },
      ],
    },
    required: false,
    display: {},
  }
  const { container } = render(<ChartBlock block={block} index={0} />)
  expect(container.querySelector('.recharts-responsive-container')).not.toBeNull()
})

test('renders line chart wrapper for kind=line', () => {
  const block = {
    id: 'c3',
    type: 'chart' as const,
    title: '',
    content: {
      kind: 'line' as const,
      data: [
        { name: 'W1', value: 3 },
        { name: 'W2', value: 5 },
      ],
    },
    required: false,
    display: {},
  }
  const { container } = render(<ChartBlock block={block} index={0} />)
  expect(container.querySelector('.recharts-responsive-container')).not.toBeNull()
})

test('renders SVG for kind=progress_ring with percent text', () => {
  const block = {
    id: 'c4',
    type: 'chart' as const,
    title: '',
    content: {
      kind: 'progress_ring' as const,
      data: { value: 65, max: 100, label: 'Completed' },
    },
    required: false,
    display: {},
  }
  const { container } = render(<ChartBlock block={block} index={0} />)
  const svg = container.querySelector('svg')
  expect(svg).not.toBeNull()
  expect(container.textContent).toContain('65%')
  expect(container.textContent).toContain('Completed')
})

test('progress_ring does NOT wrap in ResponsiveContainer (non-recharts SVG)', () => {
  const block = {
    id: 'c5',
    type: 'chart' as const,
    title: '',
    content: {
      kind: 'progress_ring' as const,
      data: { value: 50, max: 100 },
    },
    required: false,
    display: {},
  }
  const { container } = render(<ChartBlock block={block} index={0} />)
  expect(container.querySelector('.recharts-responsive-container')).toBeNull()
  expect(container.querySelector('svg')).not.toBeNull()
})
