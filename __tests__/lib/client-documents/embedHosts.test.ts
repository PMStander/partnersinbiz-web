import { isAllowedEmbed } from '@/lib/client-documents/embedHosts'

test('allows calendly', () => {
  expect(isAllowedEmbed('https://calendly.com/peetstander/intro')).toBe(true)
})

test('allows tally subdomain', () => {
  expect(isAllowedEmbed('https://tally.so/r/abc')).toBe(true)
})

test('allows figma subdomain', () => {
  expect(isAllowedEmbed('https://www.figma.com/file/abc/proto')).toBe(true)
})

test('allows google docs', () => {
  expect(isAllowedEmbed('https://docs.google.com/document/d/abc/edit')).toBe(true)
})

test('blocks unknown host', () => {
  expect(isAllowedEmbed('https://evil.example.com')).toBe(false)
})

test('blocks non-https', () => {
  expect(isAllowedEmbed('http://calendly.com/x')).toBe(false)
})

test('blocks invalid url', () => {
  expect(isAllowedEmbed('not a url')).toBe(false)
})

test('blocks empty string', () => {
  expect(isAllowedEmbed('')).toBe(false)
})
