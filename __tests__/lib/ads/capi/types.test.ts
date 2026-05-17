// __tests__/lib/ads/capi/types.test.ts
import type { CapiUserRaw, CapiEventInput } from '@/lib/ads/capi/types'

describe('CapiUserRaw shape', () => {
  it('accepts all optional PII fields', () => {
    const user: CapiUserRaw = {
      email: 'john@example.com',
      phone: '+12125551234',
      firstName: 'John',
      lastName: 'Doe',
      gender: 'M',
      city: 'New York',
      state: 'NY',
      country: 'US',
      zip: '10001',
      dob: '1990-01-01',
      externalId: 'user_123',
      fbp: '_ga.2.1234567890.1234567890',
      fbc: 'fb.1.1234567890.987654321',
    }
    expect(user.email).toBe('john@example.com')
    expect(user.fbp).toBeDefined()
  })

  it('allows empty user object', () => {
    const user: CapiUserRaw = {}
    expect(Object.keys(user).length).toBe(0)
  })
})

describe('CapiEventInput shape', () => {
  it('matches Meta CAPI event structure with required fields', () => {
    const event: CapiEventInput = {
      event_id: 'evt_12345',
      event_name: 'Purchase',
      event_time: 1621000000,
      user: { email: 'test@example.com' },
      action_source: 'website',
    }
    expect(event.event_id).toBe('evt_12345')
    expect(event.event_name).toBe('Purchase')
    expect(event.event_time).toBe(1621000000)
    expect(event.action_source).toBe('website')
  })

  it('accepts optional custom_data, event_source_url, property_id, and opt_out', () => {
    const event: CapiEventInput = {
      event_id: 'evt_67890',
      event_name: 'Lead',
      event_time: 1621000000,
      user: { firstName: 'Jane' },
      custom_data: { value: 99.99, currency: 'USD' },
      action_source: 'phone_call',
      event_source_url: 'https://example.com/contact',
      property_id: 'prop_abc123',
      opt_out: false,
    }
    expect(event.custom_data?.value).toBe(99.99)
    expect(event.event_source_url).toBe('https://example.com/contact')
    expect(event.property_id).toBe('prop_abc123')
  })

  it('supports all valid action_source values', () => {
    const sources = ['website', 'email', 'phone_call', 'system_generated', 'other'] as const
    for (const source of sources) {
      const event: CapiEventInput = {
        event_id: 'evt_123',
        event_name: 'Test',
        event_time: 1621000000,
        user: {},
        action_source: source,
      }
      expect(event.action_source).toBe(source)
    }
  })
})
