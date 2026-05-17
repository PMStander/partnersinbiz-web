/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import '@testing-library/jest-dom'
import { RemarketingBuilder } from '@/components/ads/google/audience-builders/RemarketingBuilder'

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }) }))

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ success: true, data: { audience: { id: 'aud-1' } } }),
  }) as unknown as typeof fetch
})

describe('RemarketingBuilder', () => {
  it('renders form with name, lifespan, rule kind, and rule value', () => {
    render(<RemarketingBuilder orgId="org_1" orgSlug="acme" />)
    expect(screen.getByLabelText(/Audience name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Membership lifespan/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Rule kind/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Rule value/i)).toBeInTheDocument()
  })

  it('Create button is disabled until name and rule value are filled', () => {
    render(<RemarketingBuilder orgId="org_1" orgSlug="acme" />)
    const btn = screen.getByRole('button', { name: /Create audience/i })
    expect(btn).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/Audience name/i), { target: { value: 'Visitors' } })
    expect(btn).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/Rule value/i), { target: { value: '/pricing' } })
    expect(btn).not.toBeDisabled()
  })

  it('submits POST with correct REMARKETING body shape', async () => {
    render(<RemarketingBuilder orgId="org_1" orgSlug="acme" />)

    fireEvent.change(screen.getByLabelText(/Audience name/i), { target: { value: 'Pricing Visitors' } })
    fireEvent.change(screen.getByLabelText(/Membership lifespan/i), { target: { value: '60' } })
    fireEvent.change(screen.getByLabelText(/Rule value/i), { target: { value: '/pricing' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Create audience/i }))
    })

    await waitFor(() => {
      const [url, opts] = (global.fetch as jest.Mock).mock.calls[0]
      expect(url).toBe('/api/v1/ads/custom-audiences')
      const body = JSON.parse((opts as RequestInit).body as string)
      expect(body.platform).toBe('google')
      expect(body.name).toBe('Pricing Visitors')
      expect(body.providerData.google.subtype).toBe('REMARKETING')
      expect(body.providerData.google.membershipLifeSpanDays).toBe(60)
      expect(body.providerData.google.rule.kind).toBe('URL_CONTAINS')
      expect(body.providerData.google.rule.value).toBe('/pricing')
    })
  })

  it('shows success state after successful submit', async () => {
    render(<RemarketingBuilder orgId="org_1" orgSlug="acme" />)

    fireEvent.change(screen.getByLabelText(/Audience name/i), { target: { value: 'Visitors' } })
    fireEvent.change(screen.getByLabelText(/Rule value/i), { target: { value: '/home' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Create audience/i }))
    })

    await waitFor(() => {
      expect(screen.getByText(/Remarketing audience created/i)).toBeInTheDocument()
    })
  })
})
