// __tests__/lib/ads/activity.test.ts
import {
  logCampaignActivity,
  logAdSetActivity,
  logAdActivity,
  logCreativeActivity,
  logCustomAudienceActivity,
} from '@/lib/ads/activity'

jest.mock('@/lib/activity/log', () => ({
  logActivity: jest.fn(),
}))

const { logActivity } = jest.requireMock('@/lib/activity/log')

const actor = { id: 'user_1', name: 'Test Admin', role: 'admin' as const }

beforeEach(() => jest.clearAllMocks())

describe('logCampaignActivity', () => {
  it('calls logActivity with ad_campaign type and formatted description', async () => {
    await logCampaignActivity({
      orgId: 'org_1',
      actor,
      action: 'launched',
      campaignId: 'cmp_1',
      campaignName: 'Summer Sale',
    })

    expect(logActivity).toHaveBeenCalledTimes(1)
    expect(logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: 'org_1',
        type: 'ad_campaign.launched',
        description: 'Launched ad campaign "Summer Sale"',
        entityId: 'cmp_1',
        entityType: 'ad_campaign',
        entityTitle: 'Summer Sale',
        actorId: 'user_1',
        actorName: 'Test Admin',
        actorRole: 'admin',
      }),
    )
  })
})

describe('logAdSetActivity', () => {
  it('calls logActivity with ad_set type and optional campaign name in description', async () => {
    await logAdSetActivity({
      orgId: 'org_1',
      actor,
      action: 'paused',
      adSetId: 'adset_1',
      adSetName: 'US Lookalike 25-54',
      campaignName: 'Summer Sale',
    })

    expect(logActivity).toHaveBeenCalledTimes(1)
    expect(logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'ad_set.paused',
        description: 'Paused ad set "US Lookalike 25-54" in campaign "Summer Sale"',
        entityId: 'adset_1',
        entityType: 'ad_set',
        entityTitle: 'US Lookalike 25-54',
      }),
    )
  })
})

describe('logAdActivity', () => {
  it('calls logActivity with ad type and formatted description', async () => {
    await logAdActivity({
      orgId: 'org_1',
      actor,
      action: 'created',
      adId: 'ad_1',
      adName: 'Carousel — Product Highlights',
    })

    expect(logActivity).toHaveBeenCalledTimes(1)
    expect(logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'ad.created',
        description: 'Created ad "Carousel — Product Highlights"',
        entityId: 'ad_1',
        entityType: 'ad',
        entityTitle: 'Carousel — Product Highlights',
      }),
    )
  })
})

describe('logCreativeActivity', () => {
  it('calls logActivity with ad_creative type and formatted description', async () => {
    await logCreativeActivity({
      orgId: 'org_1',
      actor,
      action: 'uploaded',
      creativeId: 'cre_1',
      creativeName: 'Banner 1200x628',
    })

    expect(logActivity).toHaveBeenCalledTimes(1)
    expect(logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'ad_creative.uploaded',
        description: 'Uploaded creative "Banner 1200x628"',
        entityId: 'cre_1',
        entityType: 'ad_creative',
        entityTitle: 'Banner 1200x628',
      }),
    )
  })
})

describe('logCustomAudienceActivity', () => {
  it('calls logActivity with ad_custom_audience type and lowercased audienceType in description', async () => {
    await logCustomAudienceActivity({
      orgId: 'org_1',
      actor,
      action: 'list_uploaded',
      audienceId: 'aud_1',
      audienceName: 'Newsletter Subscribers',
      audienceType: 'CUSTOMER_LIST',
    })

    expect(logActivity).toHaveBeenCalledTimes(1)
    expect(logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'ad_custom_audience.list_uploaded',
        description: 'Uploaded list to customer_list custom audience "Newsletter Subscribers"',
        entityId: 'aud_1',
        entityType: 'ad_custom_audience',
        entityTitle: 'Newsletter Subscribers',
      }),
    )
  })
})
