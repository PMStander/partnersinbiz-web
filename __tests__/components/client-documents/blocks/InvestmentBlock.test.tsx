import { render, screen } from '@testing-library/react'
import { InvestmentBlock } from '@/components/client-documents/blocks/InvestmentBlock'

const baseBlock = {
  id: 'i1',
  type: 'investment' as const,
  title: 'Investment',
  content: {
    items: [
      { label: 'Brand audit', amount: 15000 },
      { label: 'Quarterly content', amount: 45000 },
    ],
    total: 60000,
    currency: 'ZAR',
    notes: 'Payable in 3 monthly tranches.',
  },
  required: true,
  display: {},
}

test('renders title and line items', () => {
  render(<InvestmentBlock block={baseBlock} index={0} />)
  expect(screen.getByText('Investment')).not.toBeNull()
  expect(screen.getByText('Brand audit')).not.toBeNull()
  expect(screen.getByText('Quarterly content')).not.toBeNull()
})

test('renders total with data-counter attribute', () => {
  const { container } = render(<InvestmentBlock block={baseBlock} index={0} />)
  const counter = container.querySelector('[data-counter]')
  expect(counter).not.toBeNull()
  expect(counter?.getAttribute('data-counter')).toBe('60000')
})

test('renders notes when present', () => {
  render(<InvestmentBlock block={baseBlock} index={0} />)
  expect(screen.getByText('Payable in 3 monthly tranches.')).not.toBeNull()
})

test('defaults currency to ZAR when missing', () => {
  const block = { ...baseBlock, content: { items: [{ label: 'Item', amount: 1000 }], total: 1000 } }
  const { container } = render(<InvestmentBlock block={block} index={0} />)
  // currency formatting should produce a ZAR string
  expect(container.textContent ?? '').toMatch(/R/)
})
