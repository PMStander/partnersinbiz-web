jest.mock('firebase/app', () => ({
  getApps: jest.fn(() => []),
  initializeApp: jest.fn(() => ({})),
}))

jest.mock('firebase/messaging', () => ({
  deleteToken: jest.fn(),
  getMessaging: jest.fn(() => ({})),
  getToken: jest.fn(),
  isSupported: jest.fn(() => Promise.resolve(true)),
  onMessage: jest.fn(),
}))

import { waitForActiveServiceWorker } from '@/lib/firebase/messaging'

type Listener = () => void

function makeWorker(state: ServiceWorkerState) {
  const listeners = new Set<Listener>()
  return {
    state,
    addEventListener: jest.fn((_event: string, listener: Listener) => {
      listeners.add(listener)
    }),
    removeEventListener: jest.fn((_event: string, listener: Listener) => {
      listeners.delete(listener)
    }),
    activate() {
      this.state = 'activated'
      listeners.forEach((listener) => listener())
    },
  }
}

describe('waitForActiveServiceWorker', () => {
  it('returns immediately when the registration is already active', async () => {
    const registration = {
      active: {},
      update: jest.fn(),
    } as unknown as ServiceWorkerRegistration

    await expect(waitForActiveServiceWorker(registration)).resolves.toBe(registration)
    expect(registration.update).not.toHaveBeenCalled()
  })

  it('waits for the installing worker to activate before resolving', async () => {
    const worker = makeWorker('installing')
    const registration = {
      active: null,
      installing: worker,
      waiting: null,
      update: jest.fn(),
    } as unknown as ServiceWorkerRegistration

    const result = waitForActiveServiceWorker(registration, 1000)
    worker.activate()

    await expect(result).resolves.toBe(registration)
    expect(worker.addEventListener).toHaveBeenCalledWith('statechange', expect.any(Function))
    expect(worker.removeEventListener).toHaveBeenCalledWith('statechange', expect.any(Function))
  })
})
