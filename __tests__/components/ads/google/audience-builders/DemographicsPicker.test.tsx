/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import '@testing-library/jest-dom'
import { DemographicsPicker } from '@/components/ads/google/audience-builders/DemographicsPicker'

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }) }))

const MOCK_AUDIENCES = [
  { resourceName: 'audienceConstants/555', name: 'Parents' },
  { resourceName: 'audienceConstants/666', name: 'College Students', description: 'Ages 18-24 in college' },
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

describe('DemographicsPicker', () => {
  it('loads and renders demographic segment list with descriptions', async () => {
    render(<DemographicsPicker orgId="org_1" orgSlug="acme" />)
    expect(screen.getByText(/Loading demographic segments/i)).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByLabelText('Parents')).toBeInTheDocument()
      expect(screen.getByLabelText('College Students')).toBeInTheDocument()
      expect(screen.getByText('Ages 18-24 in college')).toBeInTheDocument()
    })
  })

  it('filters demographic list by search input', async () => {
    render(<DemographicsPicker orgId="org_1" orgSlug="acme" />)

    await waitFor(() => expect(screen.getByLabelText('Parents')).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText(/Search demographic segments/i), {
      target: { value: 'college' },
    })

    expect(screen.queryByLabelText('Parents')).not.toBeInTheDocument()
    expect(screen.getByLabelText('College Students')).toBeInTheDocument()
  })

  it('submits POST with correct DETAILED_DEMOGRAPHICS body shape', async () => {
    render(<DemographicsPicker orgId="org_1" orgSlug="acme" />)

    await waitFor(() => expect(screen.getByLabelText('Parents')).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText(/Audience name/i), { target: { value: 'Parents Segment' } })
    fireEvent.click(screen.getByLabelText('Parents'))

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
      expect(body.providerData.google.subtype).toBe('DETAILED_DEMOGRAPHICS')
      expect(body.providerData.google.audienceResourceName).toBe('audienceConstants/555')
      expect(body.providerData.google.categoryName).toBe('Parents')
    })
  })
})
