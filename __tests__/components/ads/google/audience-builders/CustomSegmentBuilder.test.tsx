/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import '@testing-library/jest-dom'
import { CustomSegmentBuilder } from '@/components/ads/google/audience-builders/CustomSegmentBuilder'

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }) }))

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ success: true, data: { audience: { id: 'aud-1' } } }),
  }) as unknown as typeof fetch
})

describe('CustomSegmentBuilder', () => {
  it('renders form with name, segment type radios, and values textarea', () => {
    render(<CustomSegmentBuilder orgId="org_1" orgSlug="acme" />)
    expect(screen.getByLabelText(/Audience name/i)).toBeInTheDocument()
    expect(screen.getByLabelText('Keywords')).toBeInTheDocument()
    expect(screen.getByLabelText('URLs')).toBeInTheDocument()
    expect(screen.getByLabelText('App IDs')).toBeInTheDocument()
    expect(screen.getByLabelText(/Values/i)).toBeInTheDocument()
  })

  it('Create button is disabled until name and at least one value are provided', () => {
    render(<CustomSegmentBuilder orgId="org_1" orgSlug="acme" />)
    const btn = screen.getByRole('button', { name: /Create audience/i })
    expect(btn).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/Audience name/i), { target: { value: 'Runners' } })
    expect(btn).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/Values/i), { target: { value: 'running shoes' } })
    expect(btn).not.toBeDisabled()
  })

  it('submits POST with correct CUSTOM_SEGMENT body shape and trimmed values', async () => {
    render(<CustomSegmentBuilder orgId="org_1" orgSlug="acme" />)

    fireEvent.change(screen.getByLabelText(/Audience name/i), { target: { value: 'Runners' } })
    fireEvent.change(screen.getByLabelText(/Values/i), {
      target: { value: 'running shoes\nmarathon training\n' },
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Create audience/i }))
    })

    await waitFor(() => {
      const [url, opts] = (global.fetch as jest.Mock).mock.calls[0]
      expect(url).toBe('/api/v1/ads/custom-audiences')
      const body = JSON.parse((opts as RequestInit).body as string)
      expect(body.platform).toBe('google')
      expect(body.providerData.google.subtype).toBe('CUSTOM_SEGMENT')
      expect(body.providerData.google.segmentType).toBe('KEYWORD')
      expect(body.providerData.google.values).toEqual(['running shoes', 'marathon training'])
    })
  })

  it('switches segment type to URL when radio is clicked', () => {
    render(<CustomSegmentBuilder orgId="org_1" orgSlug="acme" />)
    const urlRadio = screen.getByLabelText('URLs')
    fireEvent.click(urlRadio)
    expect(urlRadio).toBeChecked()
    expect(screen.getByLabelText('Keywords')).not.toBeChecked()
  })
})
