import type {
  AdConversionAction,
  AdConversionCategory,
  AdConversionActionValueSettings,
} from '@/lib/ads/types'
import { Timestamp } from 'firebase-admin/firestore'

describe('AdConversionAction canonical type (Sub-3a Phase 6)', () => {
  const now = Timestamp.now()

  it('compiles with Google provider data', () => {
    const action: AdConversionAction = {
      id: 'ca-1',
      orgId: 'org-1',
      platform: 'google',
      name: 'Test purchase',
      category: 'PURCHASE',
      valueSettings: { defaultValue: 25, defaultCurrencyCode: 'ZAR' },
      countingType: 'ONE_PER_CLICK',
      providerData: { google: { conversionActionResourceName: 'customers/123/conversionActions/456' } },
      createdAt: now,
      updatedAt: now,
    }
    expect(action.platform).toBe('google')
    expect(action.providerData?.google?.conversionActionResourceName).toMatch(/conversionActions/)
  })

  it('compiles with Meta provider data', () => {
    const action: AdConversionAction = {
      id: 'ca-2',
      orgId: 'org-1',
      platform: 'meta',
      name: 'Test lead',
      category: 'LEAD',
      valueSettings: {},
      countingType: 'MANY_PER_CLICK',
      providerData: { meta: { customEventType: 'Lead', pixelId: '999' } },
      createdAt: now,
      updatedAt: now,
    }
    expect(action.platform).toBe('meta')
    expect(action.providerData?.meta?.pixelId).toBe('999')
  })

  it('compiles without providerData (canonical-only)', () => {
    const action: AdConversionAction = {
      id: 'ca-3',
      orgId: 'org-1',
      platform: 'google',
      name: 'Test signup',
      category: 'SIGNUP',
      valueSettings: {},
      countingType: 'ONE_PER_CLICK',
      createdAt: now,
      updatedAt: now,
    }
    expect(action.providerData).toBeUndefined()
  })

  it('AdConversionCategory enum covers PURCHASE / LEAD / SIGNUP / DOWNLOAD', () => {
    const categories: AdConversionCategory[] = ['PURCHASE', 'LEAD', 'SIGNUP', 'DOWNLOAD']
    expect(categories).toHaveLength(4)
  })

  it('AdConversionActionValueSettings allows all partial combinations', () => {
    const empty: AdConversionActionValueSettings = {}
    const valueOnly: AdConversionActionValueSettings = { defaultValue: 10 }
    const currencyOnly: AdConversionActionValueSettings = { defaultCurrencyCode: 'USD' }
    const all: AdConversionActionValueSettings = {
      defaultValue: 50,
      defaultCurrencyCode: 'ZAR',
      alwaysUseDefault: true,
    }
    expect(empty).toBeDefined()
    expect(valueOnly.defaultValue).toBe(10)
    expect(currencyOnly.defaultCurrencyCode).toBe('USD')
    expect(all.alwaysUseDefault).toBe(true)
  })
})
