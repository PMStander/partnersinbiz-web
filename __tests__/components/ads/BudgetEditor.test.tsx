/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { BudgetEditor, type BudgetValue } from '@/components/ads/BudgetEditor'

describe('BudgetEditor', () => {
  it('shows CBO toggle and bid strategy for campaign level only', () => {
    const onChange = jest.fn()
    const v: BudgetValue = { shape: 'daily', amount: 5000 }
    const { rerender } = render(<BudgetEditor level="campaign" value={v} onChange={onChange} />)
    expect(screen.getByText(/Campaign Budget Optimization/i)).toBeInTheDocument()
    expect(screen.getByText(/Bid strategy/i)).toBeInTheDocument()

    rerender(<BudgetEditor level="adset" value={v} onChange={onChange} />)
    expect(screen.queryByText(/Campaign Budget Optimization/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Bid strategy/i)).not.toBeInTheDocument()
  })

  it('emits cents amount when user types dollars', () => {
    const onChange = jest.fn()
    const v: BudgetValue = { shape: 'daily', amount: 5000 }
    render(<BudgetEditor level="adset" value={v} onChange={onChange} />)
    const input = screen.getByLabelText(/Budget amount/i) as HTMLInputElement
    fireEvent.change(input, { target: { value: '12.34' } })
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ amount: 1234 }))
  })

  it('shows start/end inputs only for lifetime shape', () => {
    const onChange = jest.fn()
    const { rerender } = render(
      <BudgetEditor level="campaign" value={{ shape: 'daily', amount: 5000 }} onChange={onChange} />,
    )
    expect(screen.queryByText(/Start/)).not.toBeInTheDocument()

    rerender(
      <BudgetEditor
        level="campaign"
        value={{ shape: 'lifetime', amount: 50000, startTimeISO: '', endTimeISO: '' }}
        onChange={onChange}
      />,
    )
    expect(screen.getByText('Start')).toBeInTheDocument()
    expect(screen.getByText('End')).toBeInTheDocument()
  })

  it('switching shape via radio emits new shape', () => {
    const onChange = jest.fn()
    render(
      <BudgetEditor
        level="campaign"
        value={{ shape: 'daily', amount: 5000 }}
        onChange={onChange}
      />,
    )
    fireEvent.click(screen.getByLabelText('Lifetime'))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ shape: 'lifetime' }))
  })
})
