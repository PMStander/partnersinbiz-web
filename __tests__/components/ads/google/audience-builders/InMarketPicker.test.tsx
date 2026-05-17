/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import '@testing-library/jest-dom'
import { InMarketPicker } from '@/components/ads/google/audience-builders/InMarketPicker'

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }) }))

const MOCK_AUDIENCES = [
  { resourceName: 'audienceConstants/333', name: 'Car Buyers' },
  { resourceName: 'audienceConstants/444', name: 'Home Buyers' },
]

beforeEach(() => {
  global.fetch = jest.fn().mockImplementation((url: string) => {
    if (typeof url === 'string' && url.includes('browse')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, data: { audiences: MOCK_AUDIENCES } }),
      })
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ success: true, data: { audience: { id: 'aud-1' } } }),
    })
  }) as unknown as typeof fetch
})

describe('InMarketPicker', () => {
  it('loads and renders in-market audience list', async () => {
    render(<InMarketPicker orgId="org_1" orgSlug="acme" />)
    expect(screen.getByText(/Loading in-market audiences/i)).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByLabelText('Car Buyers')).toBeInTheDocument()
      expect(screen.getByLabelText('Home Buyers')).toBeInTheDocument()
    })
  })

  it('Save button is disabled until name and audience are both selected', async () => {
    render(<InMarketPicker orgId="org_1" orgSlug="acme" />)

    await waitFor(() => expect(screen.getByLabelText('Car Buyers')).toBeInTheDocument())

    const btn = screen.getByRole('button', { name: /Save audience/i })
    expect(btn).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/Audience name/i), { target: { value: 'Car Buyers' } })
    expect(btn).toBeDisabled() // no audience selected yet

    fireEvent.click(screen.getByLabelText('Car Buyers'))
    expect(btn).not.toBeDisabled()
  })

  it('submits POST with correct IN_MARKET body shape', async () => {
    render(<InMarketPicker orgId="org_1" orgSlug="acme" />)

    await waitFor(() => expect(screen.getByLabelText('Car Buyers')).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText(/Audience name/i), { target: { value: 'Car Buyers' } })
    fireEvent.click(screen.getByLabelText('Car Buyers'))

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Save audience/i }))
    })

    await waitFor(() => {
      const calls = (global.fetch as jest.Mock).mock.calls
      const postCall = calls.find(([url]: [string]) => !url.includes('browse'))
      expect(postCall).toBeDefined()
      const [, opts] = postCall
      const body = JSON.parse((opts as RequestInit).body as string)
      expect(body.platform).toBe('google')
      expect(body.providerData.google.subtype).toBe('IN_MARKET')
      expect(body.providerData.google.audienceResourceName).toBe('audienceConstants/333')
    })
  })
})
