import { chartPalette } from '@/lib/client-documents/chartPalette'

const HEX_RE = /^#[0-9a-f]{6}$/i

test('returns the accent unchanged when n=1', () => {
  expect(chartPalette('#F5A623', 1)).toEqual(['#F5A623'])
})

test('returns n entries starting with the accent', () => {
  const palette = chartPalette('#F5A623', 5)
  expect(palette.length).toBe(5)
  expect(palette[0]).toBe('#F5A623')
})

test('every output is a valid #RRGGBB hex', () => {
  const palette = chartPalette('#F5A623', 5)
  palette.forEach((c) => {
    expect(c).toMatch(HEX_RE)
  })
})

test('honours requested count of 8', () => {
  const palette = chartPalette('#3b82f6', 8)
  expect(palette.length).toBe(8)
  palette.forEach((c) => expect(c).toMatch(HEX_RE))
  expect(palette[0]).toBe('#3b82f6')
})

test('returns just accent when n<=0', () => {
  expect(chartPalette('#F5A623', 0)).toEqual(['#F5A623'])
})

test('returns input unchanged for non-hex accent (graceful)', () => {
  const palette = chartPalette('not-a-hex', 3)
  expect(palette.length).toBe(3)
  expect(palette[0]).toBe('not-a-hex')
})
