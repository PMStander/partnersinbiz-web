/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import '@testing-library/jest-dom'
import { EngagementCABuilder } from '@/components/ads/audience-builders/EngagementCABuilder'

beforeEach(() => {
  global.fetch = jest.fn() as unknown as typeof fetch
})

describe('EngagementCABuilder', () => {
  it('renders form with engagement type select, source ID, and retention', () => {
    render(<EngagementCABuilder orgId="org_1" />)
    expect(screen.getByLabelText(/Audience name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Engagement type/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Source ID/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Retention/i)).toBeInTheDocument()
  })

  it('placeholder text on Source ID updates when engagement type changes', () => {
    render(<EngagementCABuilder orgId="org_1" />)
    const sourceInput = screen.getByLabelText(/Source ID/i) as HTMLInputElement

    // Default: PAGE → Facebook Page ID
    expect(sourceInput.placeholder).toBe('Facebook Page ID')

    fireEvent.change(screen.getByLabelText(/Engagement type/i), { target: { value: 'VIDEO' } })
    expect(sourceInput.placeholder).toBe('Facebook Video ID')

    fireEvent.change(screen.getByLabelText(/Engagement type/i), { target: { value: 'INSTAGRAM_ACCOUNT' } })
    expect(sourceInput.placeholder).toBe('Instagram Account ID')
  })

  it('Create button disabled until name and source ID filled', () => {
    render(<EngagementCABuilder orgId="org_1" />)
    const btn = screen.getByRole('button', { name: /Create audience/i })
    expect(btn).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/Audience name/i), { target: { value: 'Engagers' } })
    expect(btn).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/Source ID/i), { target: { value: '12345' } })
    expect(btn).not.toBeDisabled()
  })

  it('submits with correct body shape and calls onComplete', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: { id: 'ca_eng1', name: 'Engagers', type: 'ENGAGEMENT' } }),
    })

    const onComplete = jest.fn()
    render(<EngagementCABuilder orgId="org_1" onComplete={onComplete} />)

    fireEvent.change(screen.getByLabelText(/Audience name/i), { target: { value: 'Engagers' } })
    fireEvent.change(screen.getByLabelText(/Engagement type/i), { target: { value: 'LEAD_FORM' } })
    fireEvent.change(screen.getByLabelText(/Source ID/i), { target: { value: 'lf_999' } })
    fireEvent.change(screen.getByLabelText(/Retention/i), { target: { value: '60' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Create audience/i }))
    })

    await waitFor(() => expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'ca_eng1', type: 'ENGAGEMENT' }),
    ))

    const [url, opts] = (global.fetch as jest.Mock).mock.calls[0]
    expect(url).toBe('/api/v1/ads/custom-audiences')
    const sent = JSON.parse(opts.body)
    expect(sent.input.source.kind).toBe('ENGAGEMENT')
    expect(sent.input.source.engagementType).toBe('LEAD_FORM')
    expect(sent.input.source.sourceObjectId).toBe('lf_999')
    expect(sent.input.source.retentionDays).toBe(60)
  })
})
