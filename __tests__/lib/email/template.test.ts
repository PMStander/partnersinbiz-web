import { interpolate, extractVariables, varsFromContact } from '@/lib/email/template'

describe('lib/email/template', () => {
  describe('interpolate', () => {
    it('replaces a single token', () => {
      expect(interpolate('Hi {{firstName}}', { firstName: 'Sarah' })).toBe('Hi Sarah')
    })

    it('replaces multiple tokens', () => {
      const out = interpolate('Hi {{firstName}} from {{company}}', {
        firstName: 'Sarah',
        company: 'AHS Law',
      })
      expect(out).toBe('Hi Sarah from AHS Law')
    })

    it('tolerates whitespace inside braces', () => {
      expect(interpolate('Hi {{ firstName }}', { firstName: 'Sarah' })).toBe('Hi Sarah')
    })

    it('returns empty string for unknown vars (never throws)', () => {
      expect(interpolate('Hi {{firstName}} {{missing}}', { firstName: 'Sarah' })).toBe('Hi Sarah ')
    })

    it('coerces numeric values', () => {
      expect(interpolate('Step {{step}}', { step: 3 })).toBe('Step 3')
    })

    it('passes through non-token braces', () => {
      expect(interpolate('Use {literal} braces', {})).toBe('Use {literal} braces')
    })

    it('handles empty templates', () => {
      expect(interpolate('', { firstName: 'X' })).toBe('')
    })
  })

  describe('extractVariables', () => {
    it('lists referenced vars', () => {
      expect(extractVariables('Hi {{firstName}} from {{company}}').sort()).toEqual([
        'company', 'firstName',
      ])
    })

    it('deduplicates repeats', () => {
      expect(extractVariables('{{x}} {{x}} {{y}}').sort()).toEqual(['x', 'y'])
    })

    it('returns empty for templates without tokens', () => {
      expect(extractVariables('plain text')).toEqual([])
    })
  })

  describe('varsFromContact', () => {
    it('splits a single name field into first + last', () => {
      const v = varsFromContact({ name: 'Sarah Jones', email: 's@x.com' })
      expect(v.firstName).toBe('Sarah')
      expect(v.lastName).toBe('Jones')
      expect(v.fullName).toBe('Sarah Jones')
    })

    it('handles single-word names', () => {
      const v = varsFromContact({ name: 'Madonna' })
      expect(v.firstName).toBe('Madonna')
      expect(v.lastName).toBe('')
    })

    it('prefers explicit firstName/lastName over splitting name', () => {
      const v = varsFromContact({ name: 'X Y', firstName: 'Real', lastName: 'Name' })
      expect(v.firstName).toBe('Real')
      expect(v.lastName).toBe('Name')
    })
  })
})
