/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { TargetingEditorBasic } from '@/components/ads/TargetingEditorBasic'
import type { AdTargeting } from '@/lib/ads/types'

function makeTargeting(over: Partial<AdTargeting> = {}): AdTargeting {
  return {
    geo: { countries: [] },
    demographics: { ageMin: 18, ageMax: 65 },
    ...over,
  }
}

describe('TargetingEditorBasic', () => {
  it('warns when no countries selected', () => {
    render(<TargetingEditorBasic value={makeTargeting()} onChange={() => {}} />)
    expect(screen.getByText(/Pick at least one country/i)).toBeInTheDocument()
  })

  it('toggles country on click', () => {
    const onChange = jest.fn()
    render(<TargetingEditorBasic value={makeTargeting()} onChange={onChange} />)
    fireEvent.click(screen.getByLabelText('United States'))
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ geo: { countries: ['US'] } }),
    )
  })

  it('updates ageMin / ageMax', () => {
    const onChange = jest.fn()
    render(<TargetingEditorBasic value={makeTargeting()} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Minimum age'), { target: { value: '25' } })
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        demographics: expect.objectContaining({ ageMin: 25 }),
      }),
    )
  })

  it('toggles gender', () => {
    const onChange = jest.fn()
    render(<TargetingEditorBasic value={makeTargeting()} onChange={onChange} />)
    fireEvent.click(screen.getByLabelText('Female'))
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        demographics: expect.objectContaining({ genders: ['female'] }),
      }),
    )
  })
})
