import { act, fireEvent, render, waitFor } from '@testing-library/react'
import { AccessCodeForm } from '@/components/client-documents/share/AccessCodeForm'

describe('AccessCodeForm', () => {
  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(global as any).fetch = jest.fn()
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  test('renders the heading + input', () => {
    const { container, getByLabelText } = render(
      <AccessCodeForm editShareToken="tok" onSuccess={() => {}} />,
    )
    expect(container.textContent).toContain('Enter access code')
    expect(getByLabelText('Access code')).not.toBeNull()
  })

  test('uppercases input value', () => {
    const { getByLabelText } = render(
      <AccessCodeForm editShareToken="tok" onSuccess={() => {}} />,
    )
    const input = getByLabelText('Access code') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'abc123' } })
    expect(input.value).toBe('ABC123')
  })

  test('disables submit until 6 chars entered', () => {
    const { getByLabelText, getByText } = render(
      <AccessCodeForm editShareToken="tok" onSuccess={() => {}} />,
    )
    const button = getByText('Continue') as HTMLButtonElement
    expect(button.disabled).toBe(true)
    const input = getByLabelText('Access code') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'abcdef' } })
    expect(button.disabled).toBe(false)
  })

  test('submits POSTs uppercased code to verify-code endpoint', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      json: async () => ({ success: true, data: {} }),
    })
    const onSuccess = jest.fn()
    const { getByLabelText, getByText } = render(
      <AccessCodeForm editShareToken="tok-xyz" onSuccess={onSuccess} />,
    )
    fireEvent.change(getByLabelText('Access code'), { target: { value: 'abc123' } })
    await act(async () => {
      fireEvent.click(getByText('Continue'))
    })
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/v1/public/client-documents/edit/tok-xyz/verify-code',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'ABC123' }),
      },
    )
    await waitFor(() => expect(onSuccess).toHaveBeenCalled())
  })

  test('shows error when API returns success:false', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      json: async () => ({ success: false, error: 'Incorrect code' }),
    })
    const onSuccess = jest.fn()
    const { container, getByLabelText, getByText } = render(
      <AccessCodeForm editShareToken="tok" onSuccess={onSuccess} />,
    )
    fireEvent.change(getByLabelText('Access code'), { target: { value: 'xxxxxx' } })
    await act(async () => {
      fireEvent.click(getByText('Continue'))
    })
    await waitFor(() => expect(container.textContent).toContain('Incorrect code'))
    expect(onSuccess).not.toHaveBeenCalled()
  })
})
