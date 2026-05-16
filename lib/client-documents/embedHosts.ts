const ALLOWED_HOSTS = new Set<string>([
  'calendly.com',
  'tally.so',
  'typeform.com',
  'forms.typeform.com',
  'figma.com',
  'codesandbox.io',
  'docs.google.com',
  'forms.gle',
])

export function isAllowedEmbed(url: string): boolean {
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:') return false
    return Array.from(ALLOWED_HOSTS).some(
      (host) => u.hostname === host || u.hostname.endsWith('.' + host),
    )
  } catch {
    return false
  }
}
