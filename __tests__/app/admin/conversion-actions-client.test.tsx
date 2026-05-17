/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import '@testing-library/jest-dom'
import { ConversionActionsClient } from '@/app/(admin)/admin/org/[slug]/ads/conversion-actions/ConversionActionsClient'
import type { AdConversionAction } from '@/lib/ads/types'
import { Timestamp } from 'firebase-admin/firestore'

const mockRefresh = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), refresh: mockRefresh }),
}))

beforeEach(() => {
  mockRefresh.mockClear()
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ success: true, data: { action: { id: 'ca-1' } } }),
  }) as unknown as typeof fetch
})

const now = Timestamp.now()

const MOCK_ACTIONS: AdConversionAction[] = [
  {
    id: 'ca-1',
    orgId: 'org_1',
    platform: 'google',
    name: 'Purchase',
    category: 'PURCHASE',
    countingType: 'ONE_PER_CLICK',
    valueSettings: { defaultValue: 100, defaultCurrencyCode: 'USD' },
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'ca-2',
    orgId: 'org_1',
    platform: 'meta',
    name: 'Lead Form Submit',
    category: 'LEAD',
    countingType: 'ONE_PER_CLICK',
    valueSettings: {},
    providerData: { meta: { pixelId: '9876543210' } },
    createdAt: now,
    updatedAt: now,
  },
]

describe('ConversionActionsClient', () => {
  it('renders list of conversion actions', () => {
    render(
      <ConversionActionsClient orgSlug="acme" orgId="org_1" initialActions={MOCK_ACTIONS} />
    )

    expect(screen.getByText('Purchase')).toBeInTheDocument()
    expect(screen.getByText('Lead Form Submit')).toBeInTheDocument()

    // Platform badges
    expect(screen.getByText('google')).toBeInTheDocument()
    expect(screen.getByText('meta')).toBeInTheDocument()
  })

  it('toggles form on "New conversion action" button click', () => {
    render(
      <ConversionActionsClient orgSlug="acme" orgId="org_1" initialActions={[]} />
    )

    // Form hidden initially
    expect(screen.queryByLabelText('Conversion action name')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'New conversion action' }))

    // Form now visible
    expect(screen.getByLabelText('Conversion action name')).toBeInTheDocument()

    // Cancel hides it
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByLabelText('Conversion action name')).not.toBeInTheDocument()
  })

  it('calls DELETE and refreshes on delete button click', async () => {
    render(
      <ConversionActionsClient orgSlug="acme" orgId="org_1" initialActions={MOCK_ACTIONS} />
    )

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Delete Purchase' }))
    })

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/v1/ads/conversion-actions/ca-1',
        expect.objectContaining({
          method: 'DELETE',
          headers: expect.objectContaining({ 'X-Org-Id': 'org_1' }),
        })
      )
    })

    expect(mockRefresh).toHaveBeenCalled()
  })

  it('shows empty state when no actions', () => {
    render(
      <ConversionActionsClient orgSlug="acme" orgId="org_1" initialActions={[]} />
    )

    expect(screen.getByText('No conversion actions yet.')).toBeInTheDocument()
  })
})
