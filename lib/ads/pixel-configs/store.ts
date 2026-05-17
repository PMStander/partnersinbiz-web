// lib/ads/pixel-configs/store.ts
import { adminDb } from '@/lib/firebase/admin'
import { encryptToken, decryptToken } from '@/lib/social/encryption'
import { Timestamp } from 'firebase-admin/firestore'
import type {
  AdPixelConfig,
  AdPixelConfigPlatform,
  AdPlatform,
  CreateAdPixelConfigInput,
  UpdateAdPixelConfigInput,
} from '@/lib/ads/types'
import crypto from 'crypto'

const COLLECTION = 'ad_pixel_configs'

/**
 * If the caller supplied a plaintext capiToken on a platform input,
 * encrypt it and replace with capiTokenEnc. Returns the mutated platform obj.
 */
function encryptPlatformIfNeeded(
  platform: (AdPixelConfigPlatform & { capiToken?: string }) | undefined,
  orgId: string,
): AdPixelConfigPlatform | undefined {
  if (!platform) return undefined
  const { capiToken, ...rest } = platform as AdPixelConfigPlatform & { capiToken?: string }
  if (capiToken) {
    return { ...rest, capiTokenEnc: encryptToken(capiToken, orgId) }
  }
  return rest
}

export async function createPixelConfig(args: {
  orgId: string
  createdBy: string
  input: CreateAdPixelConfigInput
  /** Optional explicit ID — useful for deterministic testing. */
  id?: string
}): Promise<AdPixelConfig> {
  const id = args.id ?? `pxc_${crypto.randomBytes(8).toString('hex')}`
  const now = Timestamp.now()

  const doc: AdPixelConfig = {
    ...args.input,
    meta: encryptPlatformIfNeeded(
      args.input.meta as (AdPixelConfigPlatform & { capiToken?: string }) | undefined,
      args.orgId,
    ),
    google: encryptPlatformIfNeeded(
      args.input.google as (AdPixelConfigPlatform & { capiToken?: string }) | undefined,
      args.orgId,
    ),
    linkedin: encryptPlatformIfNeeded(
      args.input.linkedin as (AdPixelConfigPlatform & { capiToken?: string }) | undefined,
      args.orgId,
    ),
    tiktok: encryptPlatformIfNeeded(
      args.input.tiktok as (AdPixelConfigPlatform & { capiToken?: string }) | undefined,
      args.orgId,
    ),
    id,
    orgId: args.orgId,
    createdBy: args.createdBy,
    createdAt: now,
    updatedAt: now,
  }

  await adminDb.collection(COLLECTION).doc(id).set(doc)
  return doc
}

export async function getPixelConfig(id: string): Promise<AdPixelConfig | null> {
  const snap = await adminDb.collection(COLLECTION).doc(id).get()
  if (!snap.exists) return null
  return snap.data() as AdPixelConfig
}

export async function listPixelConfigs(args: {
  orgId: string
  propertyId?: string
}): Promise<AdPixelConfig[]> {
  let query = adminDb.collection(COLLECTION).where('orgId', '==', args.orgId)

  if (args.propertyId !== undefined) {
    query = query.where('propertyId', '==', args.propertyId)
  }

  const snap = await query.get()
  return snap.docs.map((d) => d.data() as AdPixelConfig)
}

export async function updatePixelConfig(
  id: string,
  patch: UpdateAdPixelConfigInput & {
    // Allow plaintext capiToken to come in via patch — gets encrypted inline
    meta?: AdPixelConfigPlatform & { capiToken?: string }
    google?: AdPixelConfigPlatform & { capiToken?: string }
    linkedin?: AdPixelConfigPlatform & { capiToken?: string }
    tiktok?: AdPixelConfigPlatform & { capiToken?: string }
  },
): Promise<void> {
  // We need orgId to encrypt any plaintext tokens in the patch.
  // Fetch the current doc for orgId — only if any platform patch is present.
  const platformKeys: AdPlatform[] = ['meta', 'google', 'linkedin', 'tiktok']
  const hasPlatformPatch = platformKeys.some((p) => patch[p] !== undefined)

  let orgId: string | undefined
  if (hasPlatformPatch) {
    const snap = await adminDb.collection(COLLECTION).doc(id).get()
    if (snap.exists) {
      orgId = (snap.data() as AdPixelConfig).orgId
    }
  }

  const sanitisedPatch: Record<string, unknown> = { ...patch, updatedAt: Timestamp.now() }

  if (orgId) {
    for (const platform of platformKeys) {
      if (patch[platform] !== undefined) {
        sanitisedPatch[platform] = encryptPlatformIfNeeded(patch[platform], orgId)
      }
    }
  }

  await adminDb.collection(COLLECTION).doc(id).update(sanitisedPatch)
}

export async function deletePixelConfig(id: string): Promise<void> {
  await adminDb.collection(COLLECTION).doc(id).delete()
}

/**
 * Encrypt `plaintextToken` and merge it into `config[platform].capiTokenEnc`.
 * Reads the doc first to get orgId for HKDF key derivation.
 */
export async function setPlatformCapiToken(
  id: string,
  platform: AdPlatform,
  plaintextToken: string,
): Promise<void> {
  const snap = await adminDb.collection(COLLECTION).doc(id).get()
  if (!snap.exists) throw new Error(`Pixel config ${id} not found`)
  const current = snap.data() as AdPixelConfig
  const capiTokenEnc = encryptToken(plaintextToken, current.orgId)

  const existingPlatform = current[platform] ?? {}
  await adminDb
    .collection(COLLECTION)
    .doc(id)
    .update({
      [platform]: { ...existingPlatform, capiTokenEnc },
      updatedAt: Timestamp.now(),
    })
}

/**
 * Decrypt the CAPI token for the given platform.
 * Throws if no token is configured on that platform.
 */
export function decryptPlatformCapiToken(config: AdPixelConfig, platform: AdPlatform): string {
  const platformData = config[platform]
  if (!platformData?.capiTokenEnc) {
    throw new Error(`No CAPI token configured for platform ${platform} on pixel config ${config.id}`)
  }
  return decryptToken(platformData.capiTokenEnc, config.orgId)
}
