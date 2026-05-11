// lib/lead-capture/disposable-domains.ts
//
// A curated set of common burner / throwaway email providers. Used to block
// signups that come from obvious disposable inbox services. Not exhaustive —
// the burner-email space is a moving target — but covers the high-volume
// offenders. Easy to extend; entries are lowercase domain strings.

export const DISPOSABLE_DOMAINS: Set<string> = new Set([
  '10minutemail.com',
  '10minutemail.net',
  'anonbox.net',
  'anonymouz.com',
  'dispostable.com',
  'emailondeck.com',
  'ezehe.com',
  'ezztt.com',
  'fakeinbox.com',
  'fyii.de',
  'getairmail.com',
  'getnada.com',
  'guerrillamail.com',
  'guerrillamail.net',
  'guerrillamail.org',
  'guerrillamailblock.com',
  'inboxbear.com',
  'jetable.org',
  'mailcatch.com',
  'maildrop.cc',
  'mailinator.com',
  'mailinator.net',
  'mailnesia.com',
  'mailnull.com',
  'mailtemp.info',
  'mintemail.com',
  'mohmal.com',
  'mt2014.com',
  'mvrht.com',
  'mvrht.net',
  'nada.email',
  'sharklasers.com',
  'spam.la',
  'spambox.us',
  'spamgourmet.com',
  'tempmail.com',
  'tempr.email',
  'throwaway.email',
  'trashmail.com',
  'trashmail.net',
  'yopmail.com',
  'yopmail.net',
])

/**
 * Returns true if the email's domain is a known disposable / burner inbox.
 * Lowercases the domain and looks it up against the static set.
 *
 * Returns false for malformed input rather than throwing — callers should
 * validate email shape separately.
 */
export function isDisposableEmail(email: string): boolean {
  if (typeof email !== 'string') return false
  const at = email.lastIndexOf('@')
  if (at < 0 || at === email.length - 1) return false
  const domain = email.slice(at + 1).trim().toLowerCase()
  if (!domain) return false
  return DISPOSABLE_DOMAINS.has(domain)
}
