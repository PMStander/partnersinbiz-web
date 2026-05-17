/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import '@testing-library/jest-dom'
import { AffinityPicker } from '@/components/ads/google/audience-builders/AffinityPicker'

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }) }))

const MOCK_AUDIENCES = [
  { resourceName: 'audienceConstants/111', name: 'Sports Fans' },
  { resourceName: 'audienceConstants/222', name: 'Music Lovers' },
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

describe('AffinityPicker', () => {
  it('loads and renders affinity audience list', async () => {
    render(<AffinityPicker orgId="org_1" orgSlug="acme" />)
    expect(screen.getByText(/Loading affinity audiences/i)).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByLabelText('Sports Fans')).toBeInTheDocument()
      expect(screen.getByLabelText('Music Lovers')).toBeInTheDocument()
    })
  })

  it('filters the audience list by search input', async () => {
    render(<AffinityPicker orgId="org_1" orgSlug="acme" />)

    await waitFor(() => expect(screen.getByLabelText('Sports Fans')).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText(/Search affinity categories/i), {
      target: { value: 'sports' },
    })

    expect(screen.getByLabelText('Sports Fans')).toBeInTheDocument()
    expect(screen.queryByLabelText('Music Lovers')).not.toBeInTheDocument()
  })

  it('submits POST with correct AFFINITY body shape after selection', async () => {
    render(<AffinityPicker orgId="org_1" orgSlug="acme" />)

    await waitFor(() => expect(screen.getByLabelText('Sports Fans')).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText(/Audience name/i), { target: { value: 'Sports Fans Audience' } })
    fireEvent.click(screen.getByLabelText('Sports Fans'))

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Save audience/i }))
    })

    await waitFor(() => {
      const calls = (global.fetch as jest.Mock).mock.calls
      const postCall = calls.find(([url]: [string]) => !url.includes('browse'))
      expect(postCall).toBeDefined()
      const [url, opts] = postCall
      expect(url).toBe('/api/v1/ads/custom-audiences')
      const body = JSON.parse((opts as RequestInit).body as string)
      expect(body.platform).toBe('google')
      expect(body.providerData.google.subtype).toBe('AFFINITY')
      expect(body.providerData.google.audienceResourceName).toBe('audienceConstants/111')
      expect(body.providerData.google.categoryName).toBe('Sports Fans')
    })
  })
})
