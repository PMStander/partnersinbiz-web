/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import '@testing-library/jest-dom'
import { DisplayCampaignBuilder } from '@/components/ads/google/DisplayCampaignBuilder'

const mockPush = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, refresh: jest.fn() }),
}))

beforeEach(() => {
  mockPush.mockClear()
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ success: true, data: { id: 'c1' } }),
  }) as unknown as typeof fetch
})

describe('DisplayCampaignBuilder', () => {
  it('renders Step 1 (Basics) by default', () => {
    render(<DisplayCampaignBuilder orgId="org_1" orgSlug="acme" />)

    expect(screen.getByText(/1\. Basics/i)).toBeInTheDocument()
    expect(screen.getByLabelText('Campaign name')).toBeInTheDocument()
    expect(screen.getByLabelText('Daily budget')).toBeInTheDocument()
    // Awareness is the Display default — it should appear first
    expect(screen.getByText('Awareness')).toBeInTheDocument()
    expect(screen.getByText('Traffic')).toBeInTheDocument()
    expect(screen.getByText('Leads')).toBeInTheDocument()
    expect(screen.getByText('Sales')).toBeInTheDocument()
  })

  it('defaults the objective radio to AWARENESS', () => {
    render(<DisplayCampaignBuilder orgId="org_1" orgSlug="acme" />)
    const awarenessRadio = screen.getByRole('radio', { name: 'Awareness' })
    expect(awarenessRadio).toBeChecked()
  })

  it('shows validation error if campaign name is empty on Next', () => {
    render(<DisplayCampaignBuilder orgId="org_1" orgSlug="acme" />)
    fireEvent.click(screen.getByRole('button', { name: /Next/i }))
    expect(screen.getByText(/Campaign name is required/i)).toBeInTheDocument()
  })

  it('advances to Step 2 (Ad Group) after filling Step 1', () => {
    render(<DisplayCampaignBuilder orgId="org_1" orgSlug="acme" />)

    fireEvent.change(screen.getByLabelText('Campaign name'), {
      target: { value: 'Display Campaign' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Next/i }))

    expect(screen.getByText(/2\. Ad Group/i)).toBeInTheDocument()
    expect(screen.getByLabelText('Ad group name')).toBeInTheDocument()
  })

  it('shows validation error if ad group name is empty on Step 2 Next', () => {
    render(<DisplayCampaignBuilder orgId="org_1" orgSlug="acme" />)

    fireEvent.change(screen.getByLabelText('Campaign name'), {
      target: { value: 'Display Campaign' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Next/i }))
    // On step 2 — try to advance without ad group name
    fireEvent.click(screen.getByRole('button', { name: /Next/i }))
    expect(screen.getByText(/Ad group name is required/i)).toBeInTheDocument()
  })

  it('Back returns from Step 2 to Step 1', () => {
    render(<DisplayCampaignBuilder orgId="org_1" orgSlug="acme" />)

    fireEvent.change(screen.getByLabelText('Campaign name'), {
      target: { value: 'Display Campaign' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Next/i }))
    expect(screen.getByLabelText('Ad group name')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Back/i }))
    expect(screen.getByLabelText('Campaign name')).toBeInTheDocument()
  })

  it('advances through all 3 steps and shows RDA editor on Step 3', () => {
    render(<DisplayCampaignBuilder orgId="org_1" orgSlug="acme" />)

    // Step 1 → 2
    fireEvent.change(screen.getByLabelText('Campaign name'), {
      target: { value: 'Display Campaign' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Next/i }))

    // Step 2 → 3
    fireEvent.change(screen.getByLabelText('Ad group name'), {
      target: { value: 'Prospecting' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Next/i }))

    // Step 3 — RDA editor visible
    expect(screen.getByText(/3\. First RDA/i)).toBeInTheDocument()
    // Key RDA editor sections — use getAllByText for sections that appear multiple times
    expect(screen.getAllByText(/Marketing images/i).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/Headlines/i).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/Business details/i)).toBeInTheDocument()
    expect(screen.getByLabelText('Business name')).toBeInTheDocument()
  })

  it('submits all 3 API calls in sequence with correct payloads and redirects', async () => {
    ;(global.fetch as jest.Mock)
      // campaign
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { id: 'cmp_display_1' } }),
      })
      // ad set
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { id: 'ads_display_1' } }),
      })
      // ad
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { id: 'ad_display_1' } }),
      })

    render(<DisplayCampaignBuilder orgId="org_1" orgSlug="acme" />)

    // Step 1
    fireEvent.change(screen.getByLabelText('Campaign name'), {
      target: { value: 'Display Awareness Q2' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Next/i }))

    // Step 2
    fireEvent.change(screen.getByLabelText('Ad group name'), {
      target: { value: 'Prospecting' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Next/i }))

    // Step 3 — fill minimum RDA fields
    fireEvent.change(screen.getByLabelText('Marketing image 1'), {
      target: { value: 'https://example.com/banner.jpg' },
    })
    fireEvent.change(screen.getByLabelText('Square marketing image 1'), {
      target: { value: 'https://example.com/square.jpg' },
    })
    fireEvent.change(screen.getByLabelText('Headline 1'), {
      target: { value: 'Great Product' },
    })
    fireEvent.change(screen.getByLabelText('Long headline 1'), {
      target: { value: 'The best product for your needs — try it today' },
    })
    fireEvent.change(screen.getByLabelText('Description 1'), {
      target: { value: 'Buy now and get free shipping on all orders over $50.' },
    })
    fireEvent.change(screen.getByLabelText('Business name'), {
      target: { value: 'Acme Corp' },
    })
    fireEvent.change(screen.getByLabelText('Landing URL 1'), {
      target: { value: 'https://example.com/landing' },
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Create campaign/i }))
    })

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/admin/org/acme/ads/campaigns/cmp_display_1')
    })

    const calls = (global.fetch as jest.Mock).mock.calls
    expect(calls).toHaveLength(3)

    // Campaign call — must include DISPLAY campaignType
    expect(calls[0][0]).toBe('/api/v1/ads/campaigns')
    expect((calls[0][1] as RequestInit).headers).toMatchObject({ 'X-Org-Id': 'org_1' })
    const campaignBody = JSON.parse((calls[0][1] as RequestInit).body as string)
    expect(campaignBody.platform).toBe('google')
    expect(campaignBody.googleAds.campaignType).toBe('DISPLAY')
    expect(campaignBody.name).toBe('Display Awareness Q2')

    // Ad set call — must include DISPLAY_STANDARD type
    expect(calls[1][0]).toBe('/api/v1/ads/ad-sets')
    const adSetBody = JSON.parse((calls[1][1] as RequestInit).body as string)
    expect(adSetBody.platform).toBe('google')
    expect(adSetBody.googleAds.type).toBe('DISPLAY_STANDARD')
    expect(adSetBody.campaignId).toBe('cmp_display_1')

    // Ad call — must have rdaAssets
    expect(calls[2][0]).toBe('/api/v1/ads/ads')
    const adBody = JSON.parse((calls[2][1] as RequestInit).body as string)
    expect(adBody.platform).toBe('google')
    expect(adBody.name).toBe('RDA #1')
    expect(adBody.rdaAssets.marketingImages[0]).toBe('https://example.com/banner.jpg')
    expect(adBody.rdaAssets.businessName).toBe('Acme Corp')
  })

  it('shows error message when campaign POST fails', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ success: false, error: 'Budget too low' }),
    })

    render(<DisplayCampaignBuilder orgId="org_1" orgSlug="acme" />)

    // Navigate to step 3
    fireEvent.change(screen.getByLabelText('Campaign name'), {
      target: { value: 'Display Campaign' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Next/i }))
    fireEvent.change(screen.getByLabelText('Ad group name'), {
      target: { value: 'Prospecting' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Next/i }))

    // Fill minimum RDA
    fireEvent.change(screen.getByLabelText('Marketing image 1'), {
      target: { value: 'https://example.com/banner.jpg' },
    })
    fireEvent.change(screen.getByLabelText('Square marketing image 1'), {
      target: { value: 'https://example.com/square.jpg' },
    })
    fireEvent.change(screen.getByLabelText('Headline 1'), {
      target: { value: 'Great Product' },
    })
    fireEvent.change(screen.getByLabelText('Long headline 1'), {
      target: { value: 'The best product for your needs today' },
    })
    fireEvent.change(screen.getByLabelText('Description 1'), {
      target: { value: 'Buy now and get free shipping.' },
    })
    fireEvent.change(screen.getByLabelText('Business name'), {
      target: { value: 'Acme Corp' },
    })
    fireEvent.change(screen.getByLabelText('Landing URL 1'), {
      target: { value: 'https://example.com' },
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Create campaign/i }))
    })

    await waitFor(() => {
      expect(screen.getByText(/Budget too low/i)).toBeInTheDocument()
    })
  })
})
