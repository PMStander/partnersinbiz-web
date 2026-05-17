// lib/ads/providers/meta/mappers.ts
import type {
  Ad,
  AdCampaign,
  AdEntityStatus,
  AdObjective,
  AdSet,
  AdTargeting,
} from '@/lib/ads/types'

// Meta v25 enum: OUTCOME_AWARENESS, OUTCOME_TRAFFIC, OUTCOME_ENGAGEMENT, OUTCOME_LEADS, OUTCOME_SALES
const OBJECTIVE_MAP: Record<AdObjective, string> = {
  TRAFFIC: 'OUTCOME_TRAFFIC',
  LEADS: 'OUTCOME_LEADS',
  SALES: 'OUTCOME_SALES',
  AWARENESS: 'OUTCOME_AWARENESS',
  ENGAGEMENT: 'OUTCOME_ENGAGEMENT',
}

export function canonicalObjective(o: AdObjective): string {
  return OBJECTIVE_MAP[o]
}

/** Canonical → Meta status. Meta has no DRAFT; we map DRAFT → PAUSED on send. */
export function canonicalStatus(s: AdEntityStatus): string {
  switch (s) {
    case 'DRAFT':
    case 'PAUSED':
    case 'PENDING_REVIEW':
      return 'PAUSED'
    case 'ACTIVE':
      return 'ACTIVE'
    case 'ARCHIVED':
      return 'ARCHIVED'
  }
}

/** Meta → canonical. DELETED collapses to ARCHIVED. Unknown → PAUSED (safe default). */
export function metaStatusToCanonical(meta: string): AdEntityStatus {
  switch (meta) {
    case 'ACTIVE':
      return 'ACTIVE'
    case 'PAUSED':
      return 'PAUSED'
    case 'ARCHIVED':
    case 'DELETED':
      return 'ARCHIVED'
    case 'PENDING_REVIEW':
    case 'IN_REVIEW':
      return 'PENDING_REVIEW'
    default:
      return 'PAUSED'
  }
}

export interface MetaCampaignForm {
  name: string
  objective: string
  status: string
  special_ad_categories: string // JSON-stringified array
  daily_budget?: string
  lifetime_budget?: string
  bid_strategy?: string
  start_time?: string
  stop_time?: string
}

export function campaignToMetaForm(c: AdCampaign): MetaCampaignForm {
  const form: MetaCampaignForm = {
    name: c.name,
    objective: canonicalObjective(c.objective),
    status: canonicalStatus(c.status),
    special_ad_categories: JSON.stringify(c.specialAdCategories ?? []),
  }
  if (c.cboEnabled && c.dailyBudget != null) form.daily_budget = String(c.dailyBudget)
  if (c.cboEnabled && c.lifetimeBudget != null) form.lifetime_budget = String(c.lifetimeBudget)
  if (c.bidStrategy) form.bid_strategy = c.bidStrategy
  if (c.startTime) form.start_time = new Date(c.startTime.toMillis()).toISOString()
  if (c.endTime) form.stop_time = new Date(c.endTime.toMillis()).toISOString()
  return form
}

// Meta gender enum: 1 = male, 2 = female
const GENDER_MAP = { male: 1, female: 2 } as const

function mapPlacements(p: AdSet['placements']): string[] {
  const out: string[] = []
  if (p.feeds) out.push('feed')
  if (p.stories) out.push('story')
  if (p.reels) out.push('facebook_reels')
  if (p.marketplace) out.push('marketplace')
  return out
}

export interface MetaAdSetForm {
  name: string
  campaign_id: string
  status: string
  optimization_goal: string
  billing_event: string
  targeting: string // JSON-stringified
  daily_budget?: string
  lifetime_budget?: string
  bid_amount?: string
  start_time?: string
  end_time?: string
}

export function adSetToMetaForm(s: AdSet, metaCampaignId: string): MetaAdSetForm {
  const targeting: Record<string, unknown> = {
    geo_locations: {
      countries: s.targeting.geo.countries ?? [],
    },
    age_min: s.targeting.demographics.ageMin,
    age_max: s.targeting.demographics.ageMax,
  }
  if (s.targeting.demographics.genders?.length) {
    targeting.genders = s.targeting.demographics.genders.map((g) => GENDER_MAP[g])
  }
  if (s.targeting.geo.regions?.length) {
    targeting.geo_locations = {
      ...(targeting.geo_locations as Record<string, unknown>),
      regions: s.targeting.geo.regions.map((r) => ({ key: r.key })),
    }
  }
  if (s.targeting.geo.cities?.length) {
    targeting.geo_locations = {
      ...(targeting.geo_locations as Record<string, unknown>),
      cities: s.targeting.geo.cities.map((c) => ({
        key: c.key,
        radius: c.radius,
        distance_unit: c.distanceUnit,
      })),
    }
  }
  if (s.targeting.interests?.length) {
    targeting.flexible_spec = [
      { interests: s.targeting.interests.map((i) => ({ id: i.id, name: i.name })) },
    ]
  }
  targeting.facebook_positions = mapPlacements(s.placements)

  const form: MetaAdSetForm = {
    name: s.name,
    campaign_id: metaCampaignId,
    status: canonicalStatus(s.status),
    optimization_goal: s.optimizationGoal,
    billing_event: s.billingEvent,
    targeting: JSON.stringify(targeting),
  }
  if (s.dailyBudget != null) form.daily_budget = String(s.dailyBudget)
  if (s.lifetimeBudget != null) form.lifetime_budget = String(s.lifetimeBudget)
  if (s.bidAmount != null) form.bid_amount = String(s.bidAmount)
  if (s.startTime) form.start_time = new Date(s.startTime.toMillis()).toISOString()
  if (s.endTime) form.end_time = new Date(s.endTime.toMillis()).toISOString()
  return form
}

// Meta gender enum: 1 = male, 2 = female (already defined above for adSetToMetaForm)
/**
 * Convert a canonical AdTargeting to the Meta targeting JSON string.
 * Mirrors the targeting construction in adSetToMetaForm but operates on AdTargeting directly.
 */
export function targetingToMetaJson(t: AdTargeting): string {
  const targeting: Record<string, unknown> = {
    geo_locations: {
      countries: t.geo.countries ?? [],
    },
    age_min: t.demographics.ageMin,
    age_max: t.demographics.ageMax,
  }
  if (t.demographics.genders?.length) {
    targeting.genders = t.demographics.genders.map((g) => GENDER_MAP[g])
  }
  if (t.demographics.languages?.length) {
    targeting.locales = t.demographics.languages
  }
  if (t.geo.regions?.length) {
    targeting.geo_locations = {
      ...(targeting.geo_locations as Record<string, unknown>),
      regions: t.geo.regions.map((r) => ({ key: r.key })),
    }
  }
  if (t.geo.cities?.length) {
    targeting.geo_locations = {
      ...(targeting.geo_locations as Record<string, unknown>),
      cities: t.geo.cities.map((c) => ({
        key: c.key,
        radius: c.radius,
        distance_unit: c.distanceUnit,
      })),
    }
  }
  if (t.geo.locationTypes?.length) {
    targeting.geo_locations = {
      ...(targeting.geo_locations as Record<string, unknown>),
      location_types: t.geo.locationTypes,
    }
  }
  if (t.interests?.length) {
    targeting.flexible_spec = [
      { interests: t.interests.map((i) => ({ id: i.id, name: i.name })) },
    ]
  }
  if (t.behaviors?.length) {
    const existing = targeting.flexible_spec as Array<Record<string, unknown>> | undefined
    if (existing) {
      existing[0].behaviors = t.behaviors.map((b) => ({ id: b.id, name: b.name }))
    } else {
      targeting.flexible_spec = [
        { behaviors: t.behaviors.map((b) => ({ id: b.id, name: b.name })) },
      ]
    }
  }
  if (t.customAudiences) {
    if (t.customAudiences.include.length) {
      targeting.custom_audiences = t.customAudiences.include.map((id) => ({ id }))
    }
    if (t.customAudiences.exclude.length) {
      targeting.excluded_custom_audiences = t.customAudiences.exclude.map((id) => ({ id }))
    }
  }
  if (t.advantage?.detailedTargetingExpansion) {
    targeting.targeting_automation = { advantage_audience: 1 }
  }
  return JSON.stringify(targeting)
}

/** Build the Meta `object_story_spec` for an ad creative. */
export function adToMetaCreativeSpec(
  ad: Ad,
  pageId: string,
  imageHashOrHashes: string | string[],
) {
  const cta = ad.copy.callToAction
    ? { type: ad.copy.callToAction, value: { link: ad.copy.destinationUrl } }
    : undefined

  if (ad.format === 'CAROUSEL') {
    const hashes = Array.isArray(imageHashOrHashes) ? imageHashOrHashes : [imageHashOrHashes]
    return {
      name: ad.name,
      object_story_spec: {
        page_id: pageId,
        link_data: {
          link: ad.copy.destinationUrl ?? '',
          message: ad.copy.primaryText,
          name: ad.copy.headline,
          description: ad.copy.description,
          call_to_action: cta,
          child_attachments: hashes.map((image_hash) => ({
            image_hash,
            link: ad.copy.destinationUrl ?? '',
            name: ad.copy.headline,
            description: ad.copy.description,
            call_to_action: cta,
          })),
        },
      },
    }
  }

  // SINGLE_IMAGE (SINGLE_VIDEO follows similar shape with video_id; Phase 2 sticks to image)
  const image_hash = Array.isArray(imageHashOrHashes) ? imageHashOrHashes[0] : imageHashOrHashes
  return {
    name: ad.name,
    object_story_spec: {
      page_id: pageId,
      link_data: {
        image_hash,
        link: ad.copy.destinationUrl ?? '',
        message: ad.copy.primaryText,
        name: ad.copy.headline,
        description: ad.copy.description,
        call_to_action: cta,
      },
    },
  }
}
