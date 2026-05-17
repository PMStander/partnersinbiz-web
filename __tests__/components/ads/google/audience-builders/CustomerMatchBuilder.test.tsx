/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import '@testing-library/jest-dom'
import { CustomerMatchBuilder } from '@/components/ads/google/audience-builders/CustomerMatchBuilder'

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }) }))

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ success: true, data: { audience: { id: 'aud-1' } } }),
  }) as unknown as typeof fetch
})

describe('CustomerMatchBuilder', () => {
  it('renders form with name, description, and email textarea', () => {
    render(<CustomerMatchBuilder orgId="org_1" orgSlug="acme" />)
    expect(screen.getByLabelText(/Audience name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Description/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Email addresses/i)).toBeInTheDocument()
  })

  it('Create button is disabled until name and emails are filled', () => {
    render(<CustomerMatchBuilder orgId="org_1" orgSlug="acme" />)
    const btn = screen.getByRole('button', { name: /Create audience/i })
    expect(btn).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/Audience name/i), { target: { value: 'My Customers' } })
    expect(btn).toBeDisabled() // emails still empty

    fireEvent.change(screen.getByLabelText(/Email addresses/i), { target: { value: 'a@b.com' } })
    expect(btn).not.toBeDisabled()
  })

  it('submits POST with correct Google CUSTOMER_MATCH body shape', async () => {
    render(<CustomerMatchBuilder orgId="org_1" orgSlug="acme" />)

    fireEvent.change(screen.getByLabelText(/Audience name/i), { target: { value: 'Customers' } })
    fireEvent.change(screen.getByLabelText(/Email addresses/i), {
      target: { value: 'a@example.com\nb@example.com' },
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Create audience/i }))
    })

    await waitFor(() => {
      const [url, opts] = (global.fetch as jest.Mock).mock.calls[0]
      expect(url).toBe('/api/v1/ads/custom-audiences')
      expect((opts as RequestInit).headers).toMatchObject({ 'X-Org-Id': 'org_1' })
      const body = JSON.parse((opts as RequestInit).body as string)
      expect(body.platform).toBe('google')
      expect(body.name).toBe('Customers')
      expect(body.providerData.google.subtype).toBe('CUSTOMER_MATCH')
      expect(body.providerData.google.members).toEqual(['a@example.com', 'b@example.com'])
    })
  })

  it('shows success state after successful submit', async () => {
    render(<CustomerMatchBuilder orgId="org_1" orgSlug="acme" />)

    fireEvent.change(screen.getByLabelText(/Audience name/i), { target: { value: 'Customers' } })
    fireEvent.change(screen.getByLabelText(/Email addresses/i), { target: { value: 'a@b.com' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Create audience/i }))
    })

    await waitFor(() => {
      expect(screen.getByText(/Customer Match audience created/i)).toBeInTheDocument()
    })
  })
})
