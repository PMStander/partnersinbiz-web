/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import '@testing-library/jest-dom'
import { CampaignBuilder } from '@/components/ads/CampaignBuilder'

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ success: true, data: [] }),
  }) as unknown as typeof fetch
})

describe('CampaignBuilder', () => {
  it('renders step 1 (Campaign) first with objective options', () => {
    render(<CampaignBuilder orgId="org_1" orgSlug="acme" />)
    expect(screen.getByText(/1\. Campaign/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Campaign name/i)).toBeInTheDocument()
    expect(screen.getByText('Traffic')).toBeInTheDocument()
    expect(screen.getByText('Leads')).toBeInTheDocument()
    expect(screen.getByText('Sales / Conversions')).toBeInTheDocument()
  })

  it('Next advances to step 2 (Ad Set)', () => {
    render(<CampaignBuilder orgId="org_1" orgSlug="acme" />)
    fireEvent.click(screen.getByRole('button', { name: /Next/i }))
    expect(screen.getByLabelText(/Ad set name/i)).toBeInTheDocument()
    expect(screen.getByText(/Optimization goal/i)).toBeInTheDocument()
  })

  it('Back returns to previous step', () => {
    render(<CampaignBuilder orgId="org_1" orgSlug="acme" />)
    fireEvent.click(screen.getByRole('button', { name: /Next/i }))
    fireEvent.click(screen.getByRole('button', { name: /Back/i }))
    expect(screen.getByLabelText(/Campaign name/i)).toBeInTheDocument()
  })

  it('submit creates campaign, adset, ad in sequence with X-Org-Id header', async () => {
    // TargetingEditor v2 fetches saved-audiences + custom-audiences on mount (step 2).
    // Seed those 2 empty-list responses first, then the 3 real API calls.
    ;(global.fetch as jest.Mock)
      // step-2 mount: saved-audiences
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: [] }) })
      // step-2 mount: custom-audiences?status=READY
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: [] }) })
      // submit: campaign
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: { id: 'cmp_1', name: 'X' } }) })
      // submit: adset
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: { id: 'ads_1' } }) })
      // submit: ad
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: { id: 'ad_1' } }) })

    const onComplete = jest.fn()
    render(<CampaignBuilder orgId="org_1" orgSlug="acme" onComplete={onComplete} />)

    fireEvent.change(screen.getByLabelText(/Campaign name/i), { target: { value: 'Cmp' } })
    fireEvent.click(screen.getByRole('button', { name: /Next/i })) // → step 2 (TargetingEditor mounts here)

    await act(async () => {}) // flush TargetingEditor useEffect fetch calls

    fireEvent.change(screen.getByLabelText(/Ad set name/i), { target: { value: 'Set' } })
    fireEvent.click(screen.getByRole('button', { name: /Next/i })) // → step 3

    fireEvent.change(screen.getByLabelText(/Ad name/i), { target: { value: 'Ad' } })
    fireEvent.change(screen.getByLabelText(/Inline image URL/i), { target: { value: 'https://x/i.jpg' } })
    fireEvent.change(screen.getByLabelText(/Primary text/i), { target: { value: 'Buy' } })
    fireEvent.change(screen.getByLabelText(/Headline/i), { target: { value: 'Sale' } })
    fireEvent.change(screen.getByLabelText(/Destination URL/i), { target: { value: 'https://x/buy' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Create campaign/i }))
    })

    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith({
        campaignId: 'cmp_1',
        adSetId: 'ads_1',
        adId: 'ad_1',
      }),
    )

    // Verify the 3 submission calls (indices 2-4; 0-1 are TargetingEditor mount calls)
    const calls = (global.fetch as jest.Mock).mock.calls
    expect(calls.length).toBeGreaterThanOrEqual(5)
    const submitCalls = calls.filter(
      (c) =>
        typeof c[0] === 'string' &&
        (c[0].includes('/api/v1/ads/campaigns') ||
          c[0].includes('/api/v1/ads/ad-sets') ||
          c[0].includes('/api/v1/ads/ads')),
    )
    expect(submitCalls).toHaveLength(3)
    expect(submitCalls[0][0]).toBe('/api/v1/ads/campaigns')
    expect((submitCalls[0][1] as RequestInit).headers).toMatchObject({ 'X-Org-Id': 'org_1' })
    expect(submitCalls[1][0]).toBe('/api/v1/ads/ad-sets')
    expect(submitCalls[2][0]).toBe('/api/v1/ads/ads')
  })

  it('shows the error dialog when an API call fails', async () => {
    // TargetingEditor v2 fetches on step-2 mount; seed those 2 first, then the failing campaign call.
    ;(global.fetch as jest.Mock)
      // step-2 mount: saved-audiences
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: [] }) })
      // step-2 mount: custom-audiences?status=READY
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: [] }) })
      // submit: campaign — fails
      .mockResolvedValueOnce({ ok: false, json: async () => ({ success: false, error: 'Quota exceeded' }) })

    render(<CampaignBuilder orgId="org_1" orgSlug="acme" />)
    // Jump to step 3 via step 2 (TargetingEditor mounts on step 2)
    fireEvent.click(screen.getByRole('button', { name: /Next/i })) // → step 2
    await act(async () => {}) // flush TargetingEditor useEffect
    fireEvent.click(screen.getByRole('button', { name: /Next/i })) // → step 3

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Create campaign/i }))
    })

    await waitFor(() =>
      expect(screen.getByText(/Quota exceeded/i)).toBeInTheDocument(),
    )
  })
})
