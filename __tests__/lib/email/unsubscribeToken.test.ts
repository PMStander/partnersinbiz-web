/**
 * Tests for the HMAC-signed unsubscribe token helper.
 */

const ORIGINAL_ENV = process.env.UNSUBSCRIBE_TOKEN_SECRET

function loadModule() {
  // Re-require so warn-once state and env reads are fresh.
  let mod: typeof import('@/lib/email/unsubscribeToken')
  jest.isolateModules(() => {
    mod = require('@/lib/email/unsubscribeToken')
  })
  // @ts-expect-error assigned inside isolateModules callback
  return mod as typeof import('@/lib/email/unsubscribeToken')
}

describe('unsubscribeToken — strict mode (secret set)', () => {
  beforeEach(() => {
    process.env.UNSUBSCRIBE_TOKEN_SECRET = 'test-secret-value-123'
  })
  afterAll(() => {
    if (ORIGINAL_ENV === undefined) delete process.env.UNSUBSCRIBE_TOKEN_SECRET
    else process.env.UNSUBSCRIBE_TOKEN_SECRET = ORIGINAL_ENV
  })

  it('round-trips: sign → verify returns the same contactId', () => {
    const { signUnsubscribeToken, verifyUnsubscribeToken } = loadModule()
    const id = 'abc123XYZ456contact789'
    const token = signUnsubscribeToken(id)
    expect(token).toContain('.')
    expect(token.startsWith(`${id}.`)).toBe(true)
    const result = verifyUnsubscribeToken(token)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.contactId).toBe(id)
  })

  it('rejects a tampered signature', () => {
    const { signUnsubscribeToken, verifyUnsubscribeToken } = loadModule()
    const id = 'abc123XYZ456contact789'
    const token = signUnsubscribeToken(id)
    // Flip last hex char.
    const last = token[token.length - 1]
    const flipped = last === '0' ? '1' : '0'
    const tampered = token.slice(0, -1) + flipped
    const result = verifyUnsubscribeToken(tampered)
    expect(result.ok).toBe(false)
  })

  it('rejects a token with no dot', () => {
    const { verifyUnsubscribeToken } = loadModule()
    const result = verifyUnsubscribeToken('justanidwithoutsignature123456')
    expect(result.ok).toBe(false)
  })

  it('rejects a token with multiple dots', () => {
    const { verifyUnsubscribeToken } = loadModule()
    const result = verifyUnsubscribeToken('contact.id.signature')
    expect(result.ok).toBe(false)
  })

  it('rejects an empty token', () => {
    const { verifyUnsubscribeToken } = loadModule()
    expect(verifyUnsubscribeToken('').ok).toBe(false)
  })

  it('rejects a different contact id used with another id\'s signature', () => {
    const { signUnsubscribeToken, verifyUnsubscribeToken } = loadModule()
    const a = signUnsubscribeToken('contactAAAAAAAAAAAAAAA')
    const sigOfA = a.split('.')[1]
    const result = verifyUnsubscribeToken(`contactBBBBBBBBBBBBBBB.${sigOfA}`)
    expect(result.ok).toBe(false)
  })
})

describe('unsubscribeToken — permissive mode (no secret)', () => {
  beforeEach(() => {
    delete process.env.UNSUBSCRIBE_TOKEN_SECRET
  })
  afterAll(() => {
    if (ORIGINAL_ENV === undefined) delete process.env.UNSUBSCRIBE_TOKEN_SECRET
    else process.env.UNSUBSCRIBE_TOKEN_SECRET = ORIGINAL_ENV
  })

  it('accepts a 20+ char alphanumeric id when secret is unset', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const { verifyUnsubscribeToken } = loadModule()
    const id = 'abc123XYZ456contact789'
    const result = verifyUnsubscribeToken(id)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.contactId).toBe(id)
    warn.mockRestore()
  })

  it('rejects short / non-alphanumeric ids in permissive mode', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const { verifyUnsubscribeToken } = loadModule()
    expect(verifyUnsubscribeToken('short').ok).toBe(false)
    expect(verifyUnsubscribeToken('has spaces and stuff!!!!!').ok).toBe(false)
    warn.mockRestore()
  })

  it('signUnsubscribeToken returns the bare id when secret is unset', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const { signUnsubscribeToken } = loadModule()
    const id = 'abc123XYZ456contact789'
    expect(signUnsubscribeToken(id)).toBe(id)
    warn.mockRestore()
  })
})
