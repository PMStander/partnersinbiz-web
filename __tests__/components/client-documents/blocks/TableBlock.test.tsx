import { render, screen } from '@testing-library/react'
import { TableBlock } from '@/components/client-documents/blocks/TableBlock'

const baseBlock = {
  id: 'tb1',
  type: 'table' as const,
  title: 'Feature comparison',
  content: {
    headers: ['Feature', 'Starter', 'Pro'],
    rows: [
      ['Posts per month', '20', '100'],
      ['Channels', '3', '8'],
      ['Reports', 'Monthly', 'Weekly'],
    ],
  },
  required: false,
  display: {},
}

test('renders title and headers', () => {
  render(<TableBlock block={baseBlock} index={0} />)
  expect(screen.getByText('Feature comparison')).not.toBeNull()
  expect(screen.getByText('Feature')).not.toBeNull()
  expect(screen.getByText('Starter')).not.toBeNull()
  expect(screen.getByText('Pro')).not.toBeNull()
})

test('renders all rows and cells', () => {
  const { container } = render(<TableBlock block={baseBlock} index={0} />)
  const bodyRows = container.querySelectorAll('tbody tr')
  expect(bodyRows.length).toBe(3)
  expect(screen.getByText('Posts per month')).not.toBeNull()
  expect(screen.getByText('Channels')).not.toBeNull()
  expect(screen.getByText('Monthly')).not.toBeNull()
  expect(screen.getByText('Weekly')).not.toBeNull()
})
