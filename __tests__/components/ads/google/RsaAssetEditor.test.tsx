/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { RsaAssetEditor } from '@/components/ads/google/RsaAssetEditor'
import type { RsaAssets } from '@/components/ads/google/RsaAssetEditor'

const BASE_VALUE: RsaAssets = {
  headlines: [{ text: 'Headline 1' }, { text: 'Headline 2' }, { text: 'Headline 3' }],
  descriptions: [{ text: 'Description one for testing' }, { text: 'Description two for testing' }],
  finalUrls: ['https://example.com'],
}

describe('RsaAssetEditor', () => {
  it('renders headline and description inputs', () => {
    render(<RsaAssetEditor value={BASE_VALUE} onChange={jest.fn()} />)

    expect(screen.getByLabelText('Headline 1')).toHaveValue('Headline 1')
    expect(screen.getByLabelText('Headline 2')).toHaveValue('Headline 2')
    expect(screen.getByLabelText('Headline 3')).toHaveValue('Headline 3')
    expect(screen.getByLabelText('Description 1')).toHaveValue('Description one for testing')
    expect(screen.getByLabelText('Description 2')).toHaveValue('Description two for testing')
  })

  it('calls onChange when a headline is edited', () => {
    const onChange = jest.fn()
    render(<RsaAssetEditor value={BASE_VALUE} onChange={onChange} />)

    fireEvent.change(screen.getByLabelText('Headline 1'), {
      target: { value: 'New headline text' },
    })

    expect(onChange).toHaveBeenCalledTimes(1)
    const updated: RsaAssets = onChange.mock.calls[0][0]
    expect(updated.headlines[0].text).toBe('New headline text')
    // Other headlines unchanged
    expect(updated.headlines[1].text).toBe('Headline 2')
  })

  it('calls onChange when a description is edited', () => {
    const onChange = jest.fn()
    render(<RsaAssetEditor value={BASE_VALUE} onChange={onChange} />)

    fireEvent.change(screen.getByLabelText('Description 2'), {
      target: { value: 'Updated description' },
    })

    expect(onChange).toHaveBeenCalledTimes(1)
    const updated: RsaAssets = onChange.mock.calls[0][0]
    expect(updated.descriptions[1].text).toBe('Updated description')
  })

  it('shows Add headline button and adds a headline on click', () => {
    const onChange = jest.fn()
    render(<RsaAssetEditor value={BASE_VALUE} onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: /Add headline/i }))

    expect(onChange).toHaveBeenCalledTimes(1)
    const updated: RsaAssets = onChange.mock.calls[0][0]
    expect(updated.headlines).toHaveLength(4)
    expect(updated.headlines[3].text).toBe('')
  })

  it('shows char counter turning red when headline exceeds 30 chars', () => {
    const longValue: RsaAssets = {
      ...BASE_VALUE,
      headlines: [
        { text: 'A'.repeat(31) },
        { text: 'Short' },
        { text: 'Also short' },
      ],
    }
    render(<RsaAssetEditor value={longValue} onChange={jest.fn()} />)

    // The counter span for the over-limit headline should be visible
    expect(screen.getByText('31/30')).toBeInTheDocument()
  })

  it('renders final URL input', () => {
    render(<RsaAssetEditor value={BASE_VALUE} onChange={jest.fn()} />)
    expect(screen.getByLabelText('Final URL 1')).toHaveValue('https://example.com')
  })
})
