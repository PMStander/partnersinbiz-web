import { adminDb } from '@/lib/firebase/admin'
import { buildCampaignAssets } from '@/app/api/v1/campaigns/[id]/assets/route'
import { serializeForClient } from './serialize'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadCampaignWithAssets(id: string): Promise<{ campaign: any; assets: any } | null> {
  const snap = await adminDb.collection('campaigns').doc(id).get()
  if (!snap.exists) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = snap.data() as any
  if (data.deleted) return null
  const assets = await buildCampaignAssets(id)
  return {
    campaign: serializeForClient({ id: snap.id, ...data }),
    assets: serializeForClient(assets),
  }
}
