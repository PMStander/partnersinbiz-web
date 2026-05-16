import { buildMagicLinkEmail } from '@/lib/email/templates/magic-link'

test('email subject + html include sign-in url and expiry', () => {
  const { subject, html, text } = buildMagicLinkEmail({
    signInUrl: 'https://partnersinbiz.online/auth/magic-link/verify?token=ABC',
    docTitle: 'PiB Advertising Proposal',
  })
  expect(subject).toContain('Sign in')
  expect(html).toContain('https://partnersinbiz.online/auth/magic-link/verify?token=ABC')
  expect(html).toContain('15 minutes')
  expect(html).toContain('PiB Advertising Proposal')
  expect(text).toContain('https://partnersinbiz.online/auth/magic-link/verify?token=ABC')
})
