/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import '@testing-library/jest-dom'
import { LookalikeBuilder } from '@/components/ads/audience-builders/LookalikeBuilder'

const READY_CA = { id: 'ca_ready1', name: 'Customers READY', type: 'CUSTOMER_LIST', status: 'READY' }

beforeEach(() => {
  global.fetch = jest.fn() as unknown as typeof fetch
})

describe('LookalikeBuilder', () => {
  it('renders form with name, source dropdown, percent slider, and country', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: [] }),
    })
    render(<LookalikeBuilder orgId="org_1" />)
    expect(screen.getByLabelText(/Audience name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Source audience/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Similarity percent/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Country/i)).toBeInTheDocument()
  })

  it('fetches READY source audiences on mount and populates dropdown', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: [READY_CA] }),
    })
    render(<LookalikeBuilder orgId="org_1" />)

    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'Customers READY' })).toBeInTheDocument(),
    )
    const [url, opts] = (global.fetch as jest.Mock).mock.calls[0]
    expect(url).toContain('/api/v1/ads/custom-audiences')
    expect(url).toContain('status=READY')
    expect(opts.headers['X-Org-Id']).toBe('org_1')
  })

  it('Create button disabled until name, source, and country filled', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: [READY_CA] }),
    })
    render(<LookalikeBuilder orgId="org_1" />)
    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'Customers READY' })).toBeInTheDocument(),
    )

    const btn = screen.getByRole('button', { name: /Create audience/i })
    expect(btn).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/Audience name/i), { target: { value: 'LAL' } })
    expect(btn).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/Source audience/i), { target: { value: READY_CA.id } })
    expect(btn).toBeDisabled() // country still empty

    fireEvent.change(screen.getByLabelText(/Country/i), { target: { value: 'ZA' } })
    expect(btn).not.toBeDisabled()
  })

  it('submits with correct body shape and calls onComplete', async () => {
    ;(global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: [READY_CA] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { id: 'ca_lal1', name: 'LAL', type: 'LOOKALIKE' } }),
      })

    const onComplete = jest.fn()
    render(<LookalikeBuilder orgId="org_1" onComplete={onComplete} />)
    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'Customers READY' })).toBeInTheDocument(),
    )

    fireEvent.change(screen.getByLabelText(/Audience name/i), { target: { value: 'LAL' } })
    fireEvent.change(screen.getByLabelText(/Source audience/i), { target: { value: READY_CA.id } })
    fireEvent.change(screen.getByLabelText(/Similarity percent/i), { target: { value: '3' } })
    fireEvent.change(screen.getByLabelText(/Country/i), { target: { value: 'za' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Create audience/i }))
    })

    await waitFor(() => expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'ca_lal1', type: 'LOOKALIKE' }),
    ))

    const postCall = (global.fetch as jest.Mock).mock.calls[1]
    const sent = JSON.parse(postCall[1].body)
    expect(sent.input.source.kind).toBe('LOOKALIKE')
    expect(sent.input.source.sourceAudienceId).toBe(READY_CA.id)
    expect(sent.input.source.percent).toBe(3)
    expect(sent.input.source.country).toBe('ZA') // uppercased
  })
})
