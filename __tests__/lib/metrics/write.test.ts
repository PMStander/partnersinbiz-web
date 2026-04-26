import { metricDocId } from '@/lib/metrics/write'

describe('metricDocId', () => {
  it('returns a 32-char hex string', () => {
    const id = metricDocId({
      orgId: 'org_a',
      propertyId: 'prop_a',
      date: '2026-04-26',
      source: 'adsense',
      metric: 'ad_revenue',
    })
    expect(id).toMatch(/^[a-f0-9]{32}$/)
  })

  it('is deterministic — same inputs always produce same id', () => {
    const a = metricDocId({
      orgId: 'org_a',
      propertyId: 'prop_a',
      date: '2026-04-26',
      source: 'adsense',
      metric: 'ad_revenue',
    })
    const b = metricDocId({
      orgId: 'org_a',
      propertyId: 'prop_a',
      date: '2026-04-26',
      source: 'adsense',
      metric: 'ad_revenue',
    })
    expect(a).toBe(b)
  })

  it('treats undefined dimension as null (so calls without dim match calls with explicit null)', () => {
    const a = metricDocId({
      orgId: 'org',
      propertyId: 'prop',
      date: '2026-04-26',
      source: 'adsense',
      metric: 'ad_revenue',
    })
    const b = metricDocId({
      orgId: 'org',
      propertyId: 'prop',
      date: '2026-04-26',
      source: 'adsense',
      metric: 'ad_revenue',
      dimension: null,
      dimensionValue: null,
    })
    expect(a).toBe(b)
  })

  it('changes when any field changes', () => {
    const base = {
      orgId: 'org',
      propertyId: 'prop',
      date: '2026-04-26',
      source: 'adsense',
      metric: 'ad_revenue',
    }
    const id0 = metricDocId(base)
    expect(metricDocId({ ...base, orgId: 'other' })).not.toBe(id0)
    expect(metricDocId({ ...base, propertyId: 'other' })).not.toBe(id0)
    expect(metricDocId({ ...base, date: '2026-04-27' })).not.toBe(id0)
    expect(metricDocId({ ...base, source: 'admob' })).not.toBe(id0)
    expect(metricDocId({ ...base, metric: 'impressions' })).not.toBe(id0)
    expect(
      metricDocId({ ...base, dimension: 'country', dimensionValue: 'ZA' }),
    ).not.toBe(id0)
  })

  it('different dimensionValue under same dimension produces different ids', () => {
    const za = metricDocId({
      orgId: 'org',
      propertyId: 'prop',
      date: '2026-04-26',
      source: 'adsense',
      metric: 'ad_revenue',
      dimension: 'country',
      dimensionValue: 'ZA',
    })
    const us = metricDocId({
      orgId: 'org',
      propertyId: 'prop',
      date: '2026-04-26',
      source: 'adsense',
      metric: 'ad_revenue',
      dimension: 'country',
      dimensionValue: 'US',
    })
    expect(za).not.toBe(us)
  })
})
