jest.mock('@/lib/firebase/admin', () => ({
  adminAuth: {
    createSessionCookie: jest.fn(),
  },
}))

import { POST, DELETE } from '@/app/api/auth/session/route'

describe('session route', () => {
  it('exports POST handler', () => {
    expect(typeof POST).toBe('function')
  })
  it('exports DELETE handler', () => {
    expect(typeof DELETE).toBe('function')
  })
})
