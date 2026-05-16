import { projectBadgeColor } from '@/lib/projects/projectBadgeColor'

describe('projectBadgeColor', () => {
  it('returns an object with text and bg properties', () => {
    const result = projectBadgeColor('abc123')
    expect(result).toHaveProperty('text')
    expect(result).toHaveProperty('bg')
  })

  it('returns the same colour for the same projectId', () => {
    expect(projectBadgeColor('proj-1')).toEqual(projectBadgeColor('proj-1'))
  })

  it('returns different colours for different projectIds (across palette)', () => {
    const colours = ['a','b','c','d','e','f','g'].map(id => projectBadgeColor(id).text)
    expect(new Set(colours).size).toBeGreaterThan(1)
  })

  it('bg is text colour at 12% opacity (hex ends in 1f)', () => {
    const { text, bg } = projectBadgeColor('test-id')
    expect(bg).toBe(`${text}1f`)
  })
})
