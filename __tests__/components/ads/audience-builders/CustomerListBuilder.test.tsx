/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import '@testing-library/jest-dom'
import { CustomerListBuilder } from '@/components/ads/audience-builders/CustomerListBuilder'

beforeEach(() => {
  global.fetch = jest.fn() as unknown as typeof fetch
  // jsdom doesn't implement File.prototype.text(); polyfill it
  if (!File.prototype.text) {
    File.prototype.text = function () {
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => reject(reader.error)
        reader.readAsText(this)
      })
    }
  }
})

describe('CustomerListBuilder', () => {
  it('renders config form with name + file picker', () => {
    render(<CustomerListBuilder orgId="org_1" />)
    expect(screen.getByLabelText(/Audience name/i)).toBeInTheDocument()
    expect(screen.getByText(/Choose CSV/i)).toBeInTheDocument()
  })

  it('shows column-mapping selects after CSV file picked', async () => {
    render(<CustomerListBuilder orgId="org_1" />)
    const csv = new File(
      ['email,phone,name\nuser@example.com,+15551234,Alice'],
      'list.csv',
      { type: 'text/csv' },
    )
    const input = screen.getByLabelText(/CSV file/i) as HTMLInputElement
    await act(async () => {
      fireEvent.change(input, { target: { files: [csv] } })
    })
    await waitFor(() => expect(screen.getByLabelText(/Email column/i)).toBeInTheDocument())
    expect(screen.getByLabelText(/Phone column/i)).toBeInTheDocument()
  })

  it('Create button disabled until name + file + at least one column selected', async () => {
    render(<CustomerListBuilder orgId="org_1" />)
    const btn = screen.getByRole('button', { name: /Create audience/i })
    expect(btn).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/Audience name/i), { target: { value: 'My list' } })
    expect(btn).toBeDisabled()  // Still no file

    const csv = new File(
      ['email,name\nuser@example.com,Alice'],
      'list.csv',
      { type: 'text/csv' },
    )
    const input = screen.getByLabelText(/CSV file/i) as HTMLInputElement
    await act(async () => {
      fireEvent.change(input, { target: { files: [csv] } })
    })
    await waitFor(() => expect(btn).not.toBeDisabled())
  })

  it('on submit runs create then upload, calls onComplete', async () => {
    ;(global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { id: 'ca_xyz', name: 'M', type: 'CUSTOMER_LIST' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { id: 'ca_xyz', name: 'M', type: 'CUSTOMER_LIST', status: 'BUILDING' } }),
      })

    const onComplete = jest.fn()
    render(<CustomerListBuilder orgId="org_1" onComplete={onComplete} />)
    fireEvent.change(screen.getByLabelText(/Audience name/i), { target: { value: 'M' } })
    const csvContent = 'email\nuser@example.com'
    const csv = new File([csvContent], 'list.csv', { type: 'text/csv' })
    // Mock text() directly on this instance so both calls (handleFile + submit) resolve immediately
    csv.text = jest.fn().mockResolvedValue(csvContent)
    const input = screen.getByLabelText(/CSV file/i) as HTMLInputElement
    await act(async () => {
      fireEvent.change(input, { target: { files: [csv] } })
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Create audience/i }))
    })

    await waitFor(() => expect(onComplete).toHaveBeenCalled(), { timeout: 3000 })
    expect(screen.getByText(/Custom audience created/)).toBeInTheDocument()

    // Verify the two fetch calls
    const calls = (global.fetch as jest.Mock).mock.calls
    expect(calls).toHaveLength(2)
    expect(calls[0][0]).toBe('/api/v1/ads/custom-audiences')
    expect(calls[1][0]).toBe('/api/v1/ads/custom-audiences/ca_xyz/upload-list')
  })

  it('rejects CSV files larger than 50MB', async () => {
    render(<CustomerListBuilder orgId="org_1" />)
    const big = new File(['x'.repeat(100)], 'big.csv', { type: 'text/csv' })
    Object.defineProperty(big, 'size', { value: 51 * 1024 * 1024 })
    const input = screen.getByLabelText(/CSV file/i) as HTMLInputElement
    await act(async () => {
      fireEvent.change(input, { target: { files: [big] } })
    })
    await waitFor(() => expect(screen.getByText(/File too large/)).toBeInTheDocument())
  })
})
