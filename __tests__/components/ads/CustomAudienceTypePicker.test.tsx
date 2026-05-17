/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { CustomAudienceTypePicker } from '@/components/ads/CustomAudienceTypePicker'

describe('CustomAudienceTypePicker', () => {
  it('renders all 5 CA types', () => {
    render(<CustomAudienceTypePicker onSelect={() => {}} />)
    expect(screen.getByText('Customer list')).toBeInTheDocument()
    expect(screen.getByText('Website visitors')).toBeInTheDocument()
    expect(screen.getByText('Lookalike audience')).toBeInTheDocument()
    expect(screen.getByText('App users')).toBeInTheDocument()
    expect(screen.getByText('Engagement')).toBeInTheDocument()
  })

  it('calls onSelect with the type when clicked', () => {
    const onSelect = jest.fn()
    render(<CustomAudienceTypePicker onSelect={onSelect} />)
    fireEvent.click(screen.getByLabelText('Customer list'))
    expect(onSelect).toHaveBeenCalledWith('CUSTOMER_LIST')
  })

  it('disables specific types and shows reason', () => {
    render(
      <CustomAudienceTypePicker
        onSelect={() => {}}
        disabledTypes={['WEBSITE']}
        disabledReason={{ WEBSITE: 'No Pixel configured' }}
      />,
    )
    expect(screen.getByLabelText('Website visitors')).toBeDisabled()
    expect(screen.getByText('No Pixel configured')).toBeInTheDocument()
  })
})
