// __tests__/lib/ads/providers/google/display-types.test.ts
import { validateRdaAssets, type RdaAssets } from '@/lib/ads/providers/google/display-types'

const MIN_VALID: RdaAssets = {
  marketingImages: ['https://example.com/img.jpg'],
  squareMarketingImages: ['https://example.com/sq.jpg'],
  headlines: ['Buy Now'],
  longHeadlines: ['The best deal you will find today'],
  descriptions: ['Get the best value today'],
  businessName: 'Acme Corp',
  finalUrls: ['https://example.com'],
}

describe('validateRdaAssets', () => {
  it('accepts a valid minimal set of assets', () => {
    expect(() => validateRdaAssets(MIN_VALID)).not.toThrow()
  })

  it('throws when marketingImages is empty', () => {
    expect(() =>
      validateRdaAssets({ ...MIN_VALID, marketingImages: [] })
    ).toThrow('RDA requires 1-15 marketing images, got 0')
  })

  it('throws when marketingImages exceeds 15', () => {
    const images = Array.from({ length: 16 }, (_, i) => `https://example.com/img${i}.jpg`)
    expect(() =>
      validateRdaAssets({ ...MIN_VALID, marketingImages: images })
    ).toThrow('RDA requires 1-15 marketing images, got 16')
  })

  it('throws when logoImages exceeds 5', () => {
    const logos = Array.from({ length: 6 }, (_, i) => `https://example.com/logo${i}.jpg`)
    expect(() =>
      validateRdaAssets({ ...MIN_VALID, logoImages: logos })
    ).toThrow('RDA allows 0-5 logo images, got 6')
  })

  it('throws when squareLogoImages exceeds 5', () => {
    const logos = Array.from({ length: 6 }, (_, i) => `https://example.com/sqlogo${i}.jpg`)
    expect(() =>
      validateRdaAssets({ ...MIN_VALID, squareLogoImages: logos })
    ).toThrow('RDA allows 0-5 square logo images, got 6')
  })

  it('throws when headlines exceeds 5', () => {
    const headlines = ['A', 'B', 'C', 'D', 'E', 'F']
    expect(() =>
      validateRdaAssets({ ...MIN_VALID, headlines })
    ).toThrow('RDA requires 1-5 headlines, got 6')
  })

  it('throws when a headline exceeds 30 chars', () => {
    const longHeadline = 'This headline is way too long!!'  // 31 chars
    expect(() =>
      validateRdaAssets({ ...MIN_VALID, headlines: [longHeadline] })
    ).toThrow(`RDA headline > 30 chars: "${longHeadline}"`)
  })

  it('throws when a long headline exceeds 90 chars', () => {
    const tooLong = 'A'.repeat(91)
    expect(() =>
      validateRdaAssets({ ...MIN_VALID, longHeadlines: [tooLong] })
    ).toThrow(`RDA long headline > 90 chars: "${tooLong}"`)
  })

  it('throws when a description exceeds 90 chars', () => {
    const tooLong = 'D'.repeat(91)
    expect(() =>
      validateRdaAssets({ ...MIN_VALID, descriptions: [tooLong] })
    ).toThrow(`RDA description > 90 chars: "${tooLong}"`)
  })

  it('throws when businessName is blank', () => {
    expect(() =>
      validateRdaAssets({ ...MIN_VALID, businessName: '   ' })
    ).toThrow('RDA businessName is required')
  })

  it('throws when finalUrls is empty', () => {
    expect(() =>
      validateRdaAssets({ ...MIN_VALID, finalUrls: [] })
    ).toThrow('RDA requires at least one finalUrl')
  })
})
