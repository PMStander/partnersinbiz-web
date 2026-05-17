/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import '@testing-library/jest-dom'
import { WebsiteCABuilder } from '@/components/ads/audience-builders/WebsiteCABuilder'

beforeEach(() => {
  global.fetch = jest.fn() as unknown as typeof fetch
})

describe('WebsiteCABuilder', () => {
  it('renders form with name, pixel ID, retention, and URL rule inputs', () => {
    render(<WebsiteCABuilder orgId="org_1" />)
    expect(screen.getByLabelText(/Audience name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Pixel ID/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Retention/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Rule 1 value/i)).toBeInTheDocument()
  })

  it('adds and removes URL rules', () => {
    render(<WebsiteCABuilder orgId="org_1" />)
    // Initially 1 rule, no Remove button
    expect(screen.queryByLabelText(/Remove rule 1/i)).not.toBeInTheDocument()

    fireEvent.click(screen.getByText(/\+ Add rule/i))
    expect(screen.getByLabelText(/Rule 2 value/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Remove rule 1/i)).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText(/Remove rule 2/i))
    expect(screen.queryByLabelText(/Rule 2 value/i)).not.toBeInTheDocument()
    // Back to 1 rule — Remove button disappears
    expect(screen.queryByLabelText(/Remove rule 1/i)).not.toBeInTheDocument()
  })

  it('Create button disabled until name, pixel ID, and at least one non-empty rule', () => {
    render(<WebsiteCABuilder orgId="org_1" />)
    const btn = screen.getByRole('button', { name: /Create audience/i })
    expect(btn).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/Audience name/i), { target: { value: 'Visitors' } })
    expect(btn).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/Pixel ID/i), { target: { value: '123456789' } })
    expect(btn).toBeDisabled() // rule value still empty

    fireEvent.change(screen.getByLabelText(/Rule 1 value/i), { target: { value: '/pricing' } })
    expect(btn).not.toBeDisabled()
  })

  it('submits with correct body shape and calls onComplete', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: { id: 'ca_w1', name: 'W', type: 'WEBSITE' } }),
    })

    const onComplete = jest.fn()
    render(<WebsiteCABuilder orgId="org_1" onComplete={onComplete} />)

    fireEvent.change(screen.getByLabelText(/Audience name/i), { target: { value: 'W' } })
    fireEvent.change(screen.getByLabelText(/Pixel ID/i), { target: { value: '999' } })
    fireEvent.change(screen.getByLabelText(/Rule 1 value/i), { target: { value: '/pricing' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Create audience/i }))
    })

    await waitFor(() => expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'ca_w1', type: 'WEBSITE' }),
    ))

    const [url, opts] = (global.fetch as jest.Mock).mock.calls[0]
    expect(url).toBe('/api/v1/ads/custom-audiences')
    const sent = JSON.parse(opts.body)
    expect(sent.input.source.kind).toBe('WEBSITE')
    expect(sent.input.source.pixelId).toBe('999')
    expect(sent.input.source.rules).toEqual([{ op: 'url_contains', value: '/pricing' }])
  })
})
