import { render } from '@testing-library/react'
import { ComparisonBlock } from '@/components/client-documents/blocks/ComparisonBlock'

const baseBlock = {
  id: 'cmp1',
  type: 'comparison' as const,
  title: 'Us vs them',
  content: {
    headers: ['PiB', 'Agency A', 'Agency B'],
    rows: [
      { label: 'Social automation', values: [true, false, 'Limited'] },
      { label: 'Dedicated AI agent', values: [true, false, false] },
      { label: 'Setup time', values: ['1 week', '6 weeks', '4 weeks'] },
    ],
    highlightCol: 0,
  },
  required: false,
  display: {},
}

test('renders all headers', () => {
  const { container } = render(<ComparisonBlock block={baseBlock} index={0} />)
  const ths = container.querySelectorAll('th')
  // 1 empty + 3 headers = 4
  expect(ths.length).toBe(4)
  expect(container.textContent).toContain('PiB')
  expect(container.textContent).toContain('Agency A')
  expect(container.textContent).toContain('Agency B')
})

test('renders all rows with labels', () => {
  const { container } = render(<ComparisonBlock block={baseBlock} index={0} />)
  expect(container.textContent).toContain('Social automation')
  expect(container.textContent).toContain('Dedicated AI agent')
  expect(container.textContent).toContain('Setup time')
})

test('renders boolean true as CheckIcon SVG and false as CrossIcon SVG', () => {
  const { container } = render(<ComparisonBlock block={baseBlock} index={0} />)
  const svgs = container.querySelectorAll('svg')
  // We expect at least 4 svgs (true cells + false cells across the first 2 rows)
  expect(svgs.length).toBeGreaterThanOrEqual(4)
  // Check icon uses the M3 8 path; cross uses M4 4
  const paths = Array.from(container.querySelectorAll('path')).map((p) =>
    p.getAttribute('d'),
  )
  expect(paths.some((d) => d?.includes('M3 8l3 3 7-7'))).toBe(true)
  expect(paths.some((d) => d?.includes('M4 4l8 8'))).toBe(true)
})

test('renders string cell values as text', () => {
  const { container } = render(<ComparisonBlock block={baseBlock} index={0} />)
  expect(container.textContent).toContain('Limited')
  expect(container.textContent).toContain('1 week')
  expect(container.textContent).toContain('6 weeks')
})

test('highlights the chosen column header', () => {
  const { container } = render(<ComparisonBlock block={baseBlock} index={0} />)
  const ths = container.querySelectorAll<HTMLElement>('th')
  // ths[0] is the empty label cell; column 0 of data = ths[1]
  const highlighted = ths[1]
  // accent-soft is the bg; rgb value depends on CSS but we just verify the style attribute set the var
  expect(highlighted?.getAttribute('style') ?? '').toContain('var(--doc-accent-soft)')
})

test('highlights body cells in the chosen column', () => {
  const { container } = render(<ComparisonBlock block={baseBlock} index={0} />)
  // First data row, first value cell (col index 0 = highlight) should have accent-soft background
  const firstRowCells = container.querySelectorAll<HTMLElement>('tbody tr:first-child td')
  // index 0 is the label cell; index 1 is data col 0
  const target = firstRowCells[1]
  expect(target?.getAttribute('style') ?? '').toContain('var(--doc-accent-soft)')
})

test('does not highlight when highlightCol is omitted', () => {
  const block = {
    ...baseBlock,
    id: 'cmp2',
    content: {
      headers: ['A', 'B'],
      rows: [{ label: 'X', values: [true, false] }],
    },
  }
  const { container } = render(<ComparisonBlock block={block} index={0} />)
  const ths = container.querySelectorAll<HTMLElement>('th')
  expect(ths[1]?.getAttribute('style') ?? '').not.toContain('var(--doc-accent-soft)')
})
