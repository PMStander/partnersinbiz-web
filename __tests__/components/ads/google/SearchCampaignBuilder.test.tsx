/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import '@testing-library/jest-dom'
import { SearchCampaignBuilder } from '@/components/ads/google/SearchCampaignBuilder'

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

describe('SearchCampaignBuilder', () => {
  it('renders Step 1 (Basics) by default', () => {
    render(<SearchCampaignBuilder orgId="org_1" orgSlug="acme" />)

    expect(screen.getByText(/1\. Basics/i)).toBeInTheDocument()
    expect(screen.getByLabelText('Campaign name')).toBeInTheDocument()
    expect(screen.getByLabelText('Daily budget')).toBeInTheDocument()
    // Objective options
    expect(screen.getByText('Traffic')).toBeInTheDocument()
    expect(screen.getByText('Awareness')).toBeInTheDocument()
    expect(screen.getByText('Leads')).toBeInTheDocument()
    expect(screen.getByText('Sales')).toBeInTheDocument()
  })

  it('Next advances to Step 2 (Ad Group) after filling required fields', () => {
    render(<SearchCampaignBuilder orgId="org_1" orgSlug="acme" />)

    fireEvent.change(screen.getByLabelText('Campaign name'), {
      target: { value: 'My Campaign' },
    })

    fireEvent.click(screen.getByRole('button', { name: /Next/i }))

    expect(screen.getByLabelText('Ad group name')).toBeInTheDocument()
    expect(screen.getByText(/2\. Ad Group/i)).toBeInTheDocument()
  })

  it('shows validation error if campaign name is empty on Next', () => {
    render(<SearchCampaignBuilder orgId="org_1" orgSlug="acme" />)

    fireEvent.click(screen.getByRole('button', { name: /Next/i }))

    expect(screen.getByText(/Campaign name is required/i)).toBeInTheDocument()
  })

  it('Back returns from step 2 to step 1', () => {
    render(<SearchCampaignBuilder orgId="org_1" orgSlug="acme" />)

    fireEvent.change(screen.getByLabelText('Campaign name'), {
      target: { value: 'My Campaign' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Next/i }))

    // Now on step 2
    expect(screen.getByLabelText('Ad group name')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Back/i }))

    // Back on step 1
    expect(screen.getByLabelText('Campaign name')).toBeInTheDocument()
  })

  it('advances through all 3 steps', () => {
    render(<SearchCampaignBuilder orgId="org_1" orgSlug="acme" />)

    // Step 1 → 2
    fireEvent.change(screen.getByLabelText('Campaign name'), {
      target: { value: 'My Campaign' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Next/i }))

    // Step 2 → 3
    fireEvent.change(screen.getByLabelText('Ad group name'), {
      target: { value: 'My Ad Group' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Next/i }))

    // Step 3 — RSA editor visible
    expect(screen.getByText(/3\. First RSA/i)).toBeInTheDocument()
    expect(screen.getByLabelText('Headline 1')).toBeInTheDocument()
  })

  it('submits all 3 API calls in sequence and redirects', async () => {
    ;(global.fetch as jest.Mock)
      // campaign
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { id: 'cmp_1' } }),
      })
      // ad set
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { id: 'ads_1' } }),
      })
      // ad
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { id: 'ad_1' } }),
      })

    render(<SearchCampaignBuilder orgId="org_1" orgSlug="acme" />)

    // Step 1
    fireEvent.change(screen.getByLabelText('Campaign name'), {
      target: { value: 'Search Campaign' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Next/i }))

    // Step 2
    fireEvent.change(screen.getByLabelText('Ad group name'), {
      target: { value: 'Brand Keywords' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Next/i }))

    // Step 3 — fill minimum RSA
    const h1 = screen.getByLabelText('Headline 1')
    const h2 = screen.getByLabelText('Headline 2')
    const h3 = screen.getByLabelText('Headline 3')
    const d1 = screen.getByLabelText('Description 1')
    const d2 = screen.getByLabelText('Description 2')
    const url = screen.getByLabelText('Final URL 1')

    fireEvent.change(h1, { target: { value: 'Buy Shoes Online' } })
    fireEvent.change(h2, { target: { value: 'Free Shipping Today' } })
    fireEvent.change(h3, { target: { value: 'Shop All Brands' } })
    fireEvent.change(d1, { target: { value: 'Huge selection of running shoes for every budget.' } })
    fireEvent.change(d2, { target: { value: 'Fast delivery and easy returns guaranteed.' } })
    fireEvent.change(url, { target: { value: 'https://example.com/shoes' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Create campaign/i }))
    })

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/admin/org/acme/ads/campaigns/cmp_1')
    })

    const calls = (global.fetch as jest.Mock).mock.calls
    expect(calls).toHaveLength(3)

    // Campaign call
    expect(calls[0][0]).toBe('/api/v1/ads/campaigns')
    expect((calls[0][1] as RequestInit).headers).toMatchObject({ 'X-Org-Id': 'org_1' })
    const campaignBody = JSON.parse((calls[0][1] as RequestInit).body as string)
    expect(campaignBody.platform).toBe('google')
    expect(campaignBody.input.name).toBe('Search Campaign')

    // Ad set call
    expect(calls[1][0]).toBe('/api/v1/ads/ad-sets')
    const adSetBody = JSON.parse((calls[1][1] as RequestInit).body as string)
    expect(adSetBody.platform).toBe('google')
    expect(adSetBody.input.campaignId).toBe('cmp_1')

    // Ad call
    expect(calls[2][0]).toBe('/api/v1/ads/ads')
    const adBody = JSON.parse((calls[2][1] as RequestInit).body as string)
    expect(adBody.platform).toBe('google')
    expect(adBody.rsaAssets.headlines).toHaveLength(3)
    expect(adBody.rsaAssets.headlines[0].text).toBe('Buy Shoes Online')
    expect(adBody.rsaAssets.finalUrls[0]).toBe('https://example.com/shoes')
  })

  it('shows error message when campaign POST fails', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ success: false, error: 'Budget too low' }),
    })

    render(<SearchCampaignBuilder orgId="org_1" orgSlug="acme" />)

    // Navigate to step 3
    fireEvent.change(screen.getByLabelText('Campaign name'), {
      target: { value: 'Search Campaign' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Next/i }))
    fireEvent.change(screen.getByLabelText('Ad group name'), {
      target: { value: 'Brand Keywords' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Next/i }))

    // Fill minimum RSA
    fireEvent.change(screen.getByLabelText('Headline 1'), { target: { value: 'Head One Here' } })
    fireEvent.change(screen.getByLabelText('Headline 2'), { target: { value: 'Head Two Here' } })
    fireEvent.change(screen.getByLabelText('Headline 3'), { target: { value: 'Head Three Now' } })
    fireEvent.change(screen.getByLabelText('Description 1'), {
      target: { value: 'First description text here for the ad.' },
    })
    fireEvent.change(screen.getByLabelText('Description 2'), {
      target: { value: 'Second description text here for the ad.' },
    })
    fireEvent.change(screen.getByLabelText('Final URL 1'), {
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
