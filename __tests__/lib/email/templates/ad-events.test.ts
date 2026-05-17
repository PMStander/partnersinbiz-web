import { campaignLaunchedEmail, campaignPausedEmail, capiErrorEmail } from '@/lib/email/templates/ad-events'

describe('ad-events email templates', () => {
  describe('campaignLaunchedEmail', () => {
    test('returns non-empty HTML with campaign name and objective', () => {
      const html = campaignLaunchedEmail('Summer Sale 2026', 'Traffic', 'https://example.com/campaign/123')
      expect(html).toBeTruthy()
      expect(html).toContain('<!DOCTYPE html')
      expect(html).toContain('Campaign launched')
      expect(html).toContain('Summer Sale 2026')
      expect(html).toContain('traffic')
    })

    test('includes the campaign URL link', () => {
      const url = 'https://example.com/admin/org/test-org/ads/campaigns/cmp_123'
      const html = campaignLaunchedEmail('Test Campaign', 'Conversions', url)
      expect(html).toContain(url)
      expect(html).toContain('View campaign')
    })

    test('escapes HTML in campaign name and objective', () => {
      const html = campaignLaunchedEmail('<script>alert("xss")</script>', '"><script>', 'https://example.com/campaign/123')
      expect(html).not.toContain('<script>')
      expect(html).toContain('&lt;script&gt;')
      expect(html).toContain('&quot;&gt;&lt;script&gt;')
    })
  })

  describe('campaignPausedEmail', () => {
    test('returns non-empty HTML with campaign name and reason', () => {
      const html = campaignPausedEmail('Summer Sale 2026', 'Daily budget exhausted', 'https://example.com/campaign/123')
      expect(html).toBeTruthy()
      expect(html).toContain('<!DOCTYPE html')
      expect(html).toContain('Campaign paused')
      expect(html).toContain('Summer Sale 2026')
      expect(html).toContain('Daily budget exhausted')
    })

    test('includes the campaign URL link', () => {
      const url = 'https://example.com/admin/org/test-org/ads/campaigns/cmp_456'
      const html = campaignPausedEmail('Black Friday', 'Manual pause by admin', url)
      expect(html).toContain(url)
      expect(html).toContain('View campaign')
    })

    test('escapes HTML in campaign name and reason', () => {
      const html = campaignPausedEmail(
        '<img src=x onerror="alert(1)">',
        'Paused due to <malicious> reason',
        'https://example.com/campaign/123'
      )
      expect(html).not.toContain('<img')
      expect(html).toContain('&lt;img')
      expect(html).toContain('&quot;')
      expect(html).toContain('&lt;malicious&gt;')
    })
  })

  describe('capiErrorEmail', () => {
    test('returns non-empty HTML with event name and error', () => {
      const html = capiErrorEmail('Purchase', 'Connection timeout', 'https://example.com/pixel-config')
      expect(html).toBeTruthy()
      expect(html).toContain('<!DOCTYPE html')
      expect(html).toContain('Conversion API failure')
      expect(html).toContain('Purchase')
      expect(html).toContain('Connection timeout')
    })

    test('includes the pixel config URL link', () => {
      const url = 'https://example.com/admin/org/test-org/ads/pixel-config'
      const html = capiErrorEmail('InitiateCheckout', 'Invalid token', url)
      expect(html).toContain(url)
      expect(html).toContain('Open Pixel & CAPI')
    })

    test('escapes HTML in event name and error message', () => {
      const html = capiErrorEmail(
        '<script>evil()</script>',
        'Error: {"msg": "<svg onload=alert(1)>"}',
        'https://example.com/pixel-config'
      )
      expect(html).not.toContain('<script>')
      expect(html).not.toContain('<svg')
      expect(html).toContain('&lt;script&gt;')
      expect(html).toContain('&lt;svg')
    })
  })
})
