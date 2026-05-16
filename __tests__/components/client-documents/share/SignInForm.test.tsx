import { act, fireEvent, render, waitFor } from '@testing-library/react'

// Mock the firebase modules BEFORE importing the component so the component's
// top-level imports pick up the mocks.
jest.mock('firebase/auth', () => ({
  signInWithPopup: jest.fn(),
}))

jest.mock('@/lib/firebase/client', () => ({
  auth: {} as unknown,
  googleProvider: {} as unknown,
}))

import { signInWithPopup } from 'firebase/auth'
import { SignInForm } from '@/components/client-documents/share/SignInForm'

describe('SignInForm', () => {
  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(global as any).fetch = jest.fn()
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  test('renders both tabs and email tab is active by default', () => {
    const { container, getByText } = render(
      <SignInForm
        redirectUrl="/d/tok/edit"
        context={{ type: 'edit_share', editShareToken: 'tok' }}
        onAuthenticated={() => {}}
      />,
    )
    expect(getByText('Email link')).not.toBeNull()
    expect(getByText('Google')).not.toBeNull()
    expect(container.textContent).toContain('Send sign-in link')
  })

  test('switching to Google tab shows the Continue with Google button', () => {
    const { getByText, queryByText } = render(
      <SignInForm
        redirectUrl="/d/tok/edit"
        context={{ type: 'edit_share', editShareToken: 'tok' }}
        onAuthenticated={() => {}}
      />,
    )
    fireEvent.click(getByText('Google'))
    expect(getByText('Continue with Google')).not.toBeNull()
    expect(queryByText('Send sign-in link')).toBeNull()
  })

  test('submitting the email form POSTs and shows "Check your email"', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      json: async () => ({ success: true }),
    })
    const { container, getByLabelText, getByText } = render(
      <SignInForm
        redirectUrl="/d/tok/edit"
        context={{ type: 'edit_share', editShareToken: 'tok' }}
        onAuthenticated={() => {}}
      />,
    )
    fireEvent.change(getByLabelText('Email'), { target: { value: 'foo@bar.com' } })
    await act(async () => {
      fireEvent.click(getByText('Send sign-in link'))
    })
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/v1/auth/magic-link/send',
      expect.objectContaining({ method: 'POST' }),
    )
    const fetchCall = (global.fetch as jest.Mock).mock.calls[0]
    expect(JSON.parse(fetchCall[1].body)).toMatchObject({
      email: 'foo@bar.com',
      redirectUrl: '/d/tok/edit',
      context: { type: 'edit_share', editShareToken: 'tok' },
    })
    await waitFor(() => expect(container.textContent).toContain('Check your email'))
    expect(container.textContent).toContain('foo@bar.com')
  })

  test('Google flow calls signInWithPopup, POSTs idToken to /auth/session, fires onAuthenticated', async () => {
    ;(signInWithPopup as jest.Mock).mockResolvedValueOnce({
      user: { getIdToken: async () => 'id-token-xyz' },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      json: async () => ({ success: true }),
    })
    const onAuthenticated = jest.fn()
    const { getByText } = render(
      <SignInForm
        redirectUrl="/d/tok/edit"
        context={{ type: 'edit_share', editShareToken: 'tok' }}
        onAuthenticated={onAuthenticated}
      />,
    )
    fireEvent.click(getByText('Google'))
    await act(async () => {
      fireEvent.click(getByText('Continue with Google'))
    })
    expect(signInWithPopup).toHaveBeenCalled()
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/v1/auth/session',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ idToken: 'id-token-xyz' }),
      }),
    )
    await waitFor(() => expect(onAuthenticated).toHaveBeenCalled())
  })

  test('email send error shows error message and does not flip to "Check your email"', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      json: async () => ({ success: false, error: 'Rate limited' }),
    })
    const { container, getByLabelText, getByText } = render(
      <SignInForm redirectUrl="/d/tok/edit" onAuthenticated={() => {}} />,
    )
    fireEvent.change(getByLabelText('Email'), { target: { value: 'foo@bar.com' } })
    await act(async () => {
      fireEvent.click(getByText('Send sign-in link'))
    })
    await waitFor(() => expect(container.textContent).toContain('Rate limited'))
    expect(container.textContent).not.toContain('Check your email')
  })

  test('Google flow error displays error', async () => {
    ;(signInWithPopup as jest.Mock).mockRejectedValueOnce(new Error('popup-closed'))
    const onAuthenticated = jest.fn()
    const { container, getByText } = render(
      <SignInForm redirectUrl="/d/tok/edit" onAuthenticated={onAuthenticated} />,
    )
    fireEvent.click(getByText('Google'))
    await act(async () => {
      fireEvent.click(getByText('Continue with Google'))
    })
    await waitFor(() => expect(container.textContent).toContain('popup-closed'))
    expect(onAuthenticated).not.toHaveBeenCalled()
  })
})
