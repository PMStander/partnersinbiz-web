/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { RdaAssetEditor } from '@/components/ads/google/RdaAssetEditor'
import type { RdaAssets } from '@/lib/ads/providers/google/display-types'

const BASE_VALUE: RdaAssets = {
  marketingImages: ['https://example.com/banner.jpg'],
  squareMarketingImages: ['https://example.com/square.jpg'],
  headlines: ['Great Product'],
  longHeadlines: ['The best product for your needs — try it today'],
  descriptions: ['Buy now and get free shipping on all orders over fifty dollars.'],
  businessName: 'Acme Corp',
  finalUrls: ['https://example.com/landing'],
}

describe('RdaAssetEditor', () => {
  it('renders all 7 major sections', () => {
    render(<RdaAssetEditor value={BASE_VALUE} onChange={jest.fn()} />)

    // Use getAllByText where multiple matches expected; check at least one is present
    expect(screen.getAllByText(/Marketing images/i).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/Square marketing images/i).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/Logo images/i).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/Square logo images/i).length).toBeGreaterThanOrEqual(1)
    // Headlines heading: find h3 elements containing just "Headlines"
    const h3s = document.querySelectorAll('h3')
    const headlineH3 = Array.from(h3s).find((el) => el.textContent?.trim().startsWith('Headlines'))
    expect(headlineH3).toBeTruthy()
    expect(screen.getAllByText(/Long headlines/i).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/Descriptions/i).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/Business details/i)).toBeInTheDocument()
    expect(screen.getByText(/Landing URLs/i)).toBeInTheDocument()
  })

  it('renders input fields with correct initial values', () => {
    render(<RdaAssetEditor value={BASE_VALUE} onChange={jest.fn()} />)

    expect(screen.getByLabelText('Marketing image 1')).toHaveValue('https://example.com/banner.jpg')
    expect(screen.getByLabelText('Square marketing image 1')).toHaveValue('https://example.com/square.jpg')
    expect(screen.getByLabelText('Headline 1')).toHaveValue('Great Product')
    expect(screen.getByLabelText('Long headline 1')).toHaveValue('The best product for your needs — try it today')
    expect(screen.getByLabelText('Description 1')).toHaveValue('Buy now and get free shipping on all orders over fifty dollars.')
    expect(screen.getByLabelText('Business name')).toHaveValue('Acme Corp')
    expect(screen.getByLabelText('Landing URL 1')).toHaveValue('https://example.com/landing')
  })

  it('calls onChange when a headline is edited', () => {
    const onChange = jest.fn()
    render(<RdaAssetEditor value={BASE_VALUE} onChange={onChange} />)

    fireEvent.change(screen.getByLabelText('Headline 1'), {
      target: { value: 'Better Product' },
    })

    expect(onChange).toHaveBeenCalledTimes(1)
    const updated: RdaAssets = onChange.mock.calls[0][0]
    expect(updated.headlines[0]).toBe('Better Product')
  })

  it('calls onChange when a marketing image URL is edited', () => {
    const onChange = jest.fn()
    render(<RdaAssetEditor value={BASE_VALUE} onChange={onChange} />)

    fireEvent.change(screen.getByLabelText('Marketing image 1'), {
      target: { value: 'https://example.com/new-banner.jpg' },
    })

    expect(onChange).toHaveBeenCalledTimes(1)
    const updated: RdaAssets = onChange.mock.calls[0][0]
    expect(updated.marketingImages[0]).toBe('https://example.com/new-banner.jpg')
  })

  it('calls onChange when business name is changed', () => {
    const onChange = jest.fn()
    render(<RdaAssetEditor value={BASE_VALUE} onChange={onChange} />)

    fireEvent.change(screen.getByLabelText('Business name'), {
      target: { value: 'New Corp' },
    })

    expect(onChange).toHaveBeenCalledTimes(1)
    const updated: RdaAssets = onChange.mock.calls[0][0]
    expect(updated.businessName).toBe('New Corp')
  })

  it('adds a marketing image when Add button clicked', () => {
    const onChange = jest.fn()
    render(<RdaAssetEditor value={BASE_VALUE} onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: /Add Marketing images/i }))

    expect(onChange).toHaveBeenCalledTimes(1)
    const updated: RdaAssets = onChange.mock.calls[0][0]
    expect(updated.marketingImages).toHaveLength(2)
    expect(updated.marketingImages[1]).toBe('')
  })

  it('shows headline char counter and turns red over 30 chars', () => {
    const overLimitValue: RdaAssets = {
      ...BASE_VALUE,
      headlines: ['A'.repeat(31)],
    }
    render(<RdaAssetEditor value={overLimitValue} onChange={jest.fn()} />)

    expect(screen.getByText('31/30')).toBeInTheDocument()
  })

  it('shows long headline char counter and turns red over 90 chars', () => {
    const overLimitValue: RdaAssets = {
      ...BASE_VALUE,
      longHeadlines: ['B'.repeat(91)],
    }
    render(<RdaAssetEditor value={overLimitValue} onChange={jest.fn()} />)

    expect(screen.getByText('91/90')).toBeInTheDocument()
  })

  it('shows description char counter in normal state', () => {
    render(<RdaAssetEditor value={BASE_VALUE} onChange={jest.fn()} />)
    // The description text is 63 chars — should show as normal (not red)
    const counter = screen.getByText('63/90')
    expect(counter).toBeInTheDocument()
    expect(counter).not.toHaveClass('text-red-400')
  })

  it('adds a headline when Add Headlines button clicked', () => {
    const onChange = jest.fn()
    render(<RdaAssetEditor value={BASE_VALUE} onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: /Add Headlines/i }))

    expect(onChange).toHaveBeenCalledTimes(1)
    const updated: RdaAssets = onChange.mock.calls[0][0]
    expect(updated.headlines).toHaveLength(2)
    expect(updated.headlines[1]).toBe('')
  })

  it('disables all inputs when disabled prop is true', () => {
    render(<RdaAssetEditor value={BASE_VALUE} onChange={jest.fn()} disabled />)

    expect(screen.getByLabelText('Marketing image 1')).toBeDisabled()
    expect(screen.getByLabelText('Headline 1')).toBeDisabled()
    expect(screen.getByLabelText('Business name')).toBeDisabled()
  })
})
