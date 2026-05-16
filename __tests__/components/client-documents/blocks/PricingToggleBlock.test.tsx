import { fireEvent, render, within } from '@testing-library/react'
import { PricingToggleBlock } from '@/components/client-documents/blocks/PricingToggleBlock'

const baseBlock = {
  id: 'pt1',
  type: 'pricing_toggle' as const,
  title: 'Build your package',
  content: {
    items: [
      { label: 'Setup', amount: 5000, required: true },
      { label: 'Monthly retainer', amount: 20000, default: true },
      { label: 'Add-on social', amount: 8000 },
    ],
    currency: 'ZAR',
    note: 'Final total billed monthly.',
  },
  required: false,
  display: {},
}

test('renders all items with their labels', () => {
  const { container } = render(<PricingToggleBlock block={baseBlock} index={0} />)
  expect(container.textContent).toContain('Setup')
  expect(container.textContent).toContain('Monthly retainer')
  expect(container.textContent).toContain('Add-on social')
})

test('required items are disabled and marked (included)', () => {
  const { container } = render(<PricingToggleBlock block={baseBlock} index={0} />)
  const inputs = container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
  // First item is required → disabled & checked
  expect(inputs[0]?.disabled).toBe(true)
  expect(inputs[0]?.checked).toBe(true)
  // Second item is default → checked but not disabled
  expect(inputs[1]?.disabled).toBe(false)
  expect(inputs[1]?.checked).toBe(true)
  // Third item neither → unchecked, not disabled
  expect(inputs[2]?.disabled).toBe(false)
  expect(inputs[2]?.checked).toBe(false)
  // "(included)" label appears for the required one
  expect(container.textContent).toContain('(included)')
})

test('toggling an item updates the total live', () => {
  const { container } = render(<PricingToggleBlock block={baseBlock} index={0} />)
  const inputs = container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
  // Initial total: setup 5000 + retainer 20000 = 25000 ZAR
  expect(container.textContent).toMatch(/R\s*25\s*000/)
  // Toggle the add-on social on (+8000 → 33000)
  fireEvent.click(inputs[2])
  expect(container.textContent).toMatch(/R\s*33\s*000/)
  // Toggle monthly retainer off (-20000 → 13000)
  fireEvent.click(inputs[1])
  expect(container.textContent).toMatch(/R\s*13\s*000/)
})

test('renders the note', () => {
  const { container } = render(<PricingToggleBlock block={baseBlock} index={0} />)
  expect(container.textContent).toContain('Final total billed monthly.')
})

test('renders "Your total" label', () => {
  const { container } = render(<PricingToggleBlock block={baseBlock} index={0} />)
  expect(container.textContent?.toLowerCase()).toContain('your total')
})

test('handles empty items array safely', () => {
  const block = {
    id: 'pt2',
    type: 'pricing_toggle' as const,
    title: '',
    content: { items: [], currency: 'USD' },
    required: false,
    display: {},
  }
  const { container } = render(<PricingToggleBlock block={block} index={0} />)
  // Should not throw; total is 0
  expect(within(container).queryByText(/Your total/i)).not.toBeNull()
})
