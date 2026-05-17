/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import '@testing-library/jest-dom'
import { ShoppingCampaignBuilder } from '@/components/ads/google/ShoppingCampaignBuilder'

const mockPush = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, refresh: jest.fn() }),
}))

const MC_BINDING = {
  id: 'mc_1',
  orgId: 'org_1',
  merchantId: '987654321',
  accessTokenRef: 'tok_ref_1',
  refreshTokenRef: 'ref_ref_1',
  feedLabels: ['US', 'GB'],
  createdAt: null,
  updatedAt: null,
}

beforeEach(() => {
  mockPush.mockClear()
  // Default: no MC bindings
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ success: true, data: { bindings: [] } }),
  }) as unknown as typeof fetch
})

describe('ShoppingCampaignBuilder', () => {
  it('renders Step 1 (Basics) by default with SALES as default objective', () => {
    render(<ShoppingCampaignBuilder orgId="org_1" orgSlug="acme" />)

    expect(screen.getByText(/1\. Basics/i)).toBeInTheDocument()
    expect(screen.getByLabelText('Campaign name')).toBeInTheDocument()
    expect(screen.getByLabelText('Daily budget')).toBeInTheDocument()
    // SALES is the Shopping default
    const salesRadio = screen.getByRole('radio', { name: 'Sales' })
    expect(salesRadio).toBeChecked()
  })

  it('shows validation error when campaign name is empty on Next', () => {
    render(<ShoppingCampaignBuilder orgId="org_1" orgSlug="acme" />)
    fireEvent.click(screen.getByRole('button', { name: /Next/i }))
    expect(screen.getByText(/Campaign name is required/i)).toBeInTheDocument()
  })

  it('defaults daily budget to 5', () => {
    render(<ShoppingCampaignBuilder orgId="org_1" orgSlug="acme" />)
    const budgetInput = screen.getByLabelText('Daily budget') as HTMLInputElement
    expect(budgetInput.value).toBe('5')
  })

  it('advances to Step 2 (Merchant Center) after filling Step 1', async () => {
    render(<ShoppingCampaignBuilder orgId="org_1" orgSlug="acme" />)

    fireEvent.change(screen.getByLabelText('Campaign name'), {
      target: { value: 'Shopping Q3' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Next/i }))

    expect(screen.getByText(/2\. Merchant Center/i)).toBeInTheDocument()
  })

  it('fetches MC bindings when reaching Step 2', async () => {
    render(<ShoppingCampaignBuilder orgId="org_1" orgSlug="acme" />)

    // Go to step 2
    fireEvent.change(screen.getByLabelText('Campaign name'), {
      target: { value: 'Shopping Q3' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Next/i }))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/v1/ads/google/merchant-center',
        expect.objectContaining({ headers: expect.objectContaining({ 'X-Org-Id': 'org_1' }) }),
      )
    })
  })

  it('shows "Connect Merchant Center first" when no bindings exist on Step 2', async () => {
    render(<ShoppingCampaignBuilder orgId="org_1" orgSlug="acme" />)

    fireEvent.change(screen.getByLabelText('Campaign name'), {
      target: { value: 'Shopping Q3' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Next/i }))

    await waitFor(() => {
      expect(screen.getByText(/No Merchant Center account connected/i)).toBeInTheDocument()
      expect(
        screen.getByRole('link', { name: /Connect Merchant Center/i }),
      ).toBeInTheDocument()
    })
  })

  it('shows MC account dropdown when bindings exist on Step 2', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ success: true, data: { bindings: [MC_BINDING] } }),
    }) as unknown as typeof fetch

    render(<ShoppingCampaignBuilder orgId="org_1" orgSlug="acme" />)

    fireEvent.change(screen.getByLabelText('Campaign name'), {
      target: { value: 'Shopping Q3' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Next/i }))

    await waitFor(() => {
      expect(screen.getByLabelText('Merchant Center account')).toBeInTheDocument()
      expect(screen.getByText(/987654321/)).toBeInTheDocument()
    })
  })

  it('advances to Step 3 (Ad Group) after selecting MC account + feed label', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ success: true, data: { bindings: [MC_BINDING] } }),
    }) as unknown as typeof fetch

    render(<ShoppingCampaignBuilder orgId="org_1" orgSlug="acme" />)

    // Step 1
    fireEvent.change(screen.getByLabelText('Campaign name'), {
      target: { value: 'Shopping Q3' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Next/i }))

    // Wait for bindings to load and auto-select first
    await waitFor(() => {
      expect(screen.getByLabelText('Merchant Center account')).toBeInTheDocument()
    })

    // Advance to step 3
    fireEvent.click(screen.getByRole('button', { name: /Next/i }))

    await waitFor(() => {
      expect(screen.getByText(/3\. Ad Group/i)).toBeInTheDocument()
      expect(screen.getByLabelText('Ad group name')).toBeInTheDocument()
    })
  })

  it('submits all 3 API calls and redirects on success', async () => {
    ;(global.fetch as jest.Mock)
      // Step 2 GET bindings
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({ success: true, data: { bindings: [MC_BINDING] } }),
      })
      // POST campaign
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: { id: 'cmp_shop_1' } }),
      })
      // POST ad-set
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: { id: 'ads_shop_1' } }),
      })
      // POST ad
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: { id: 'ad_shop_1' } }),
      })

    render(<ShoppingCampaignBuilder orgId="org_1" orgSlug="acme" />)

    // Step 1
    fireEvent.change(screen.getByLabelText('Campaign name'), {
      target: { value: 'Shopping Q3' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Next/i }))

    // Step 2 — wait for bindings, then advance (auto-selected)
    await waitFor(() => {
      expect(screen.getByLabelText('Merchant Center account')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /Next/i }))

    // Step 3
    await waitFor(() => {
      expect(screen.getByLabelText('Ad group name')).toBeInTheDocument()
    })
    fireEvent.change(screen.getByLabelText('Ad group name'), {
      target: { value: 'All Products' },
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Create campaign/i }))
    })

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/admin/org/acme/ads/campaigns/cmp_shop_1')
    })

    const calls = (global.fetch as jest.Mock).mock.calls
    // GET bindings + 3 POST calls = 4 total
    expect(calls).toHaveLength(4)

    // Campaign call
    const campaignBody = JSON.parse((calls[1][1] as RequestInit).body as string)
    expect(campaignBody.platform).toBe('google')
    expect(campaignBody.googleAds.campaignType).toBe('SHOPPING')
    expect(campaignBody.googleAds.shopping.merchantId).toBe('987654321')
    expect(campaignBody.googleAds.shopping.feedLabel).toBeTruthy()

    // Ad set call
    const adSetBody = JSON.parse((calls[2][1] as RequestInit).body as string)
    expect(adSetBody.googleAds.type).toBe('SHOPPING_PRODUCT_ADS')

    // Ad call — productAd: true
    const adBody = JSON.parse((calls[3][1] as RequestInit).body as string)
    expect(adBody.productAd).toBe(true)
    expect(adBody.name).toBe('Product ad')
  })

  it('Back returns from Step 2 to Step 1', async () => {
    render(<ShoppingCampaignBuilder orgId="org_1" orgSlug="acme" />)

    fireEvent.change(screen.getByLabelText('Campaign name'), {
      target: { value: 'Shopping Q3' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Next/i }))

    expect(screen.getByText(/2\. Merchant Center/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Back/i }))
    expect(screen.getByLabelText('Campaign name')).toBeInTheDocument()
  })
})
