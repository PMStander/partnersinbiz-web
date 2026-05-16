import { themeFromOrg } from '@/lib/client-documents/themeFromOrg'

test('builds theme from org brand colors', () => {
  const org = {
    name: 'Acme Corp',
    settings: { brandColors: { background: '#001100', text: '#eeffee', accent: '#33cc66' } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
  const theme = themeFromOrg(org)
  expect(theme!.palette.bg).toBe('#001100')
  expect(theme!.palette.text).toBe('#eeffee')
  expect(theme!.palette.accent).toBe('#33cc66')
  expect(theme!.brandName).toBe('Acme Corp')
})

test('falls back to PiB defaults when org has no brand colors', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const org = { name: 'Plain Co', settings: {} } as any
  const theme = themeFromOrg(org)
  expect(theme!.palette.bg).toBe('#0A0A0B')
  expect(theme!.palette.accent).toBe('#F5A623')
})

test('returns null when org is null', () => {
  expect(themeFromOrg(null)).toBeNull()
})
