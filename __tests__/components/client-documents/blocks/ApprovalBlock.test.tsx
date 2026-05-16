import { render, screen } from '@testing-library/react'
import { ApprovalBlock } from '@/components/client-documents/blocks/ApprovalBlock'

const baseBlock = {
  id: 'a1',
  type: 'approval' as const,
  title: 'Sign-off',
  content: 'Please review and approve this proposal.',
  required: true,
  display: {},
}

test('renders title', () => {
  render(<ApprovalBlock block={baseBlock} index={0} />)
  expect(screen.getByText('Sign-off')).not.toBeNull()
})

test('renders body text', () => {
  render(<ApprovalBlock block={baseBlock} index={0} />)
  expect(screen.getByText('Please review and approve this proposal.')).not.toBeNull()
})

test('renders portal-approve footer text', () => {
  render(<ApprovalBlock block={baseBlock} index={0} />)
  expect(
    screen.getByText('Use the Approve button in the portal to sign off.'),
  ).not.toBeNull()
})
