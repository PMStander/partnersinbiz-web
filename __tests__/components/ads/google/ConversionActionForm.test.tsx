/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import '@testing-library/jest-dom'
import { ConversionActionForm } from '@/components/ads/google/ConversionActionForm'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}))

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ success: true, data: { action: { id: 'ca-1' } } }),
  }) as unknown as typeof fetch
})

describe('ConversionActionForm', () => {
  it('renders all core fields (platform, name, category, countingType)', () => {
    render(<ConversionActionForm orgSlug="acme" orgId="org_1" />)

    // Platform radios
    expect(screen.getByRole('radio', { name: 'Google' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Meta' })).toBeInTheDocument()

    // Name
    expect(screen.getByLabelText('Conversion action name')).toBeInTheDocument()

    // Category dropdown
    expect(screen.getByLabelText('Category')).toBeInTheDocument()

    // Counting type radios
    expect(screen.getByRole('radio', { name: 'One per click' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Many per click' })).toBeInTheDocument()

    // Value settings
    expect(screen.getByLabelText('Default value')).toBeInTheDocument()
    expect(screen.getByLabelText('Default currency')).toBeInTheDocument()
    expect(screen.getByLabelText('Always use default value')).toBeInTheDocument()
  })

  it('submits POST with expected body on Google platform', async () => {
    const onCreated = jest.fn()
    render(<ConversionActionForm orgSlug="acme" orgId="org_1" onCreated={onCreated} />)

    // Fill name
    fireEvent.change(screen.getByLabelText('Conversion action name'), {
      target: { value: 'Purchase Event' },
    })

    // Choose MANY_PER_CLICK
    fireEvent.click(screen.getByRole('radio', { name: 'Many per click' }))

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create conversion action' }))
    })

    await waitFor(() => {
      expect(onCreated).toHaveBeenCalled()
    })

    const calls = (global.fetch as jest.Mock).mock.calls
    expect(calls).toHaveLength(1)
    expect(calls[0][0]).toBe('/api/v1/ads/conversion-actions')

    const body = JSON.parse((calls[0][1] as RequestInit).body as string)
    expect(body.platform).toBe('google')
    expect(body.name).toBe('Purchase Event')
    expect(body.countingType).toBe('MANY_PER_CLICK')
    expect(body.category).toBe('PURCHASE')

    const headers = calls[0][1].headers as Record<string, string>
    expect(headers['X-Org-Id']).toBe('org_1')
  })

  it('shows pixelId + customEventType fields when platform=Meta', () => {
    render(<ConversionActionForm orgSlug="acme" orgId="org_1" />)

    // Default = Google — these fields should NOT be present
    expect(screen.queryByLabelText('Pixel ID')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Custom event type')).not.toBeInTheDocument()

    // Switch to Meta
    fireEvent.click(screen.getByRole('radio', { name: 'Meta' }))

    expect(screen.getByLabelText('Pixel ID')).toBeInTheDocument()
    expect(screen.getByLabelText('Custom event type')).toBeInTheDocument()
  })

  it('shows attribution model select when platform=Google, hides for Meta', () => {
    render(<ConversionActionForm orgSlug="acme" orgId="org_1" />)

    // Default Google — attribution model select should be present
    expect(screen.getByLabelText('Attribution model')).toBeInTheDocument()

    // Switch to Meta
    fireEvent.click(screen.getByRole('radio', { name: 'Meta' }))

    expect(screen.queryByLabelText('Attribution model')).not.toBeInTheDocument()
  })

  it('shows validation error and does not submit when name is empty', async () => {
    render(<ConversionActionForm orgSlug="acme" orgId="org_1" />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create conversion action' }))
    })

    expect(screen.getByText(/Name is required/i)).toBeInTheDocument()
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
