/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import '@testing-library/jest-dom'
import { AppCABuilder } from '@/components/ads/audience-builders/AppCABuilder'

const PROP = { id: 'prop_1', name: 'My App' }

beforeEach(() => {
  global.fetch = jest.fn() as unknown as typeof fetch
})

describe('AppCABuilder', () => {
  it('renders form with name, property dropdown, event, and retention', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: [] }),
    })
    render(<AppCABuilder orgId="org_1" />)
    expect(screen.getByLabelText(/Audience name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Property/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Event name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Retention/i)).toBeInTheDocument()
  })

  it('fetches properties on mount and populates dropdown', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: [PROP] }),
    })
    render(<AppCABuilder orgId="org_1" />)

    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'My App' })).toBeInTheDocument(),
    )
    const [url, opts] = (global.fetch as jest.Mock).mock.calls[0]
    expect(url).toBe('/api/v1/properties')
    expect(opts.headers['X-Org-Id']).toBe('org_1')
  })

  it('Create button disabled until name, property, and event filled', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: [PROP] }),
    })
    render(<AppCABuilder orgId="org_1" />)
    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'My App' })).toBeInTheDocument(),
    )

    const btn = screen.getByRole('button', { name: /Create audience/i })
    expect(btn).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/Audience name/i), { target: { value: 'App buyers' } })
    expect(btn).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/Property/i), { target: { value: PROP.id } })
    expect(btn).toBeDisabled() // event still empty

    fireEvent.change(screen.getByLabelText(/Event name/i), { target: { value: 'Purchase' } })
    expect(btn).not.toBeDisabled()
  })

  it('submits with correct body shape and calls onComplete', async () => {
    ;(global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: [PROP] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { id: 'ca_app1', name: 'App buyers', type: 'APP' } }),
      })

    const onComplete = jest.fn()
    render(<AppCABuilder orgId="org_1" onComplete={onComplete} />)
    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'My App' })).toBeInTheDocument(),
    )

    fireEvent.change(screen.getByLabelText(/Audience name/i), { target: { value: 'App buyers' } })
    fireEvent.change(screen.getByLabelText(/Property/i), { target: { value: PROP.id } })
    fireEvent.change(screen.getByLabelText(/Event name/i), { target: { value: 'Purchase' } })
    fireEvent.change(screen.getByLabelText(/Retention/i), { target: { value: '90' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Create audience/i }))
    })

    await waitFor(() => expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'ca_app1', type: 'APP' }),
    ))

    const postCall = (global.fetch as jest.Mock).mock.calls[1]
    const sent = JSON.parse(postCall[1].body)
    expect(sent.input.source.kind).toBe('APP')
    expect(sent.input.source.propertyId).toBe(PROP.id)
    expect(sent.input.source.event).toBe('Purchase')
    expect(sent.input.source.retentionDays).toBe(90)
  })
})
