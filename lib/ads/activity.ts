// lib/ads/activity.ts
import { logActivity } from '@/lib/activity/log'

export interface ActorContext {
  id: string
  name: string
  role: 'admin' | 'client' | 'ai'
}

export async function logCampaignActivity(args: {
  orgId: string
  actor: ActorContext
  action: 'launched' | 'paused' | 'edited' | 'deleted' | 'created'
  campaignId: string
  campaignName: string
}): Promise<void> {
  const action = args.action
  await logActivity({
    orgId: args.orgId,
    type: `ad_campaign.${action}`,
    actorId: args.actor.id,
    actorName: args.actor.name,
    actorRole: args.actor.role,
    description: `${humanAction(action)} ad campaign "${args.campaignName}"`,
    entityId: args.campaignId,
    entityType: 'ad_campaign',
    entityTitle: args.campaignName,
  })
}

export async function logAdSetActivity(args: {
  orgId: string
  actor: ActorContext
  action: 'launched' | 'paused' | 'edited' | 'deleted' | 'created'
  adSetId: string
  adSetName: string
  campaignName?: string
}): Promise<void> {
  const action = args.action
  await logActivity({
    orgId: args.orgId,
    type: `ad_set.${action}`,
    actorId: args.actor.id,
    actorName: args.actor.name,
    actorRole: args.actor.role,
    description: `${humanAction(action)} ad set "${args.adSetName}"${args.campaignName ? ` in campaign "${args.campaignName}"` : ''}`,
    entityId: args.adSetId,
    entityType: 'ad_set',
    entityTitle: args.adSetName,
  })
}

export async function logAdActivity(args: {
  orgId: string
  actor: ActorContext
  action: 'launched' | 'paused' | 'edited' | 'deleted' | 'created'
  adId: string
  adName: string
}): Promise<void> {
  const action = args.action
  await logActivity({
    orgId: args.orgId,
    type: `ad.${action}`,
    actorId: args.actor.id,
    actorName: args.actor.name,
    actorRole: args.actor.role,
    description: `${humanAction(action)} ad "${args.adName}"`,
    entityId: args.adId,
    entityType: 'ad',
    entityTitle: args.adName,
  })
}

export async function logCreativeActivity(args: {
  orgId: string
  actor: ActorContext
  action: 'uploaded' | 'archived' | 'synced'
  creativeId: string
  creativeName: string
}): Promise<void> {
  await logActivity({
    orgId: args.orgId,
    type: `ad_creative.${args.action}`,
    actorId: args.actor.id,
    actorName: args.actor.name,
    actorRole: args.actor.role,
    description: `${humanAction(args.action)} creative "${args.creativeName}"`,
    entityId: args.creativeId,
    entityType: 'ad_creative',
    entityTitle: args.creativeName,
  })
}

export async function logCustomAudienceActivity(args: {
  orgId: string
  actor: ActorContext
  action: 'created' | 'list_uploaded' | 'deleted'
  audienceId: string
  audienceName: string
  audienceType: string
}): Promise<void> {
  await logActivity({
    orgId: args.orgId,
    type: `ad_custom_audience.${args.action}`,
    actorId: args.actor.id,
    actorName: args.actor.name,
    actorRole: args.actor.role,
    description: `${humanAction(args.action)} ${args.audienceType.toLowerCase()} custom audience "${args.audienceName}"`,
    entityId: args.audienceId,
    entityType: 'ad_custom_audience',
    entityTitle: args.audienceName,
  })
}

function humanAction(a: string): string {
  switch (a) {
    case 'launched': return 'Launched'
    case 'paused': return 'Paused'
    case 'edited': return 'Edited'
    case 'deleted': return 'Deleted'
    case 'created': return 'Created'
    case 'uploaded': return 'Uploaded'
    case 'archived': return 'Archived'
    case 'synced': return 'Synced'
    case 'list_uploaded': return 'Uploaded list to'
    default: return a.charAt(0).toUpperCase() + a.slice(1)
  }
}
