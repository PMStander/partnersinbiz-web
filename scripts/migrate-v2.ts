/**
 * PIB v2 Firestore Migration Script
 *
 * Migrates from v1 data model (separate clients + organizations collections)
 * to v2 model (Organization as single tenant entity).
 *
 * Run with: npx tsx scripts/migrate-v2.ts
 * Execute (live write): npx tsx scripts/migrate-v2.ts --execute
 *
 * Credentials (in priority order):
 *   1. --service-account ./path/to/service-account.json
 *   2. FIREBASE_ADMIN_* env vars
 *   3. .env.local in project root
 *
 * Safety: This script is READ-FIRST, DRY-RUN by default.
 * Pass --execute to actually write changes.
 */

import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

// Manual .env.local parser — avoids dotenvx interception
;(function loadEnv() {
  const envPath = resolve(process.cwd(), '.env.local')
  if (!existsSync(envPath)) return
  const lines = readFileSync(envPath, 'utf-8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    let val = trimmed.slice(eqIdx + 1).trim()
    // Strip surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    // Only set if not already in environment
    if (!process.env[key]) process.env[key] = val
  }
})()

import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

// ── Init ──────────────────────────────────────────────────────────────────

function resolveServiceAccountPath(): string | null {
  const idx = process.argv.indexOf('--service-account')
  if (idx === -1) return null
  const p = process.argv[idx + 1]
  if (!p || p.startsWith('--')) {
    console.error('❌ --service-account requires a file path argument')
    process.exit(1)
  }
  return resolve(process.cwd(), p)
}

function init() {
  if (getApps().length > 0) return

  const saPath = resolveServiceAccountPath()

  if (saPath) {
    // Option A: service account JSON file
    if (!existsSync(saPath)) {
      console.error(`❌ Service account file not found: ${saPath}`)
      process.exit(1)
    }
    const sa = JSON.parse(readFileSync(saPath, 'utf-8'))
    initializeApp({ credential: cert(sa) })
    return
  }

  // Option B: env vars
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY

  if (!projectId || !clientEmail || !privateKey) {
    console.error('\n❌ No credentials found. Provide one of:')
    console.error('   --service-account ./service-account.json')
    console.error('   OR set in .env.local / environment:')
    console.error('     FIREBASE_ADMIN_PROJECT_ID')
    console.error('     FIREBASE_ADMIN_CLIENT_EMAIL')
    console.error('     FIREBASE_ADMIN_PRIVATE_KEY')
    console.error('\nMissing env vars:', [
      !projectId && 'FIREBASE_ADMIN_PROJECT_ID',
      !clientEmail && 'FIREBASE_ADMIN_CLIENT_EMAIL',
      !privateKey && 'FIREBASE_ADMIN_PRIVATE_KEY',
    ].filter(Boolean).join(', '))
    process.exit(1)
  }

  initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey: privateKey.replace(/\\n/g, '\n'),
    }),
  })
}

const IS_DRY_RUN = !process.argv.includes('--execute')
const SA_PATH = resolveServiceAccountPath()
const db = (() => { init(); return getFirestore() })()

function log(msg: string) { console.log(msg) }
function warn(msg: string) { console.warn(`⚠️  ${msg}`) }
function info(msg: string) { console.log(`   ${msg}`) }
function success(msg: string) { console.log(`✅ ${msg}`) }
function dryRun(msg: string) { console.log(`[DRY-RUN] ${msg}`) }

// ── Helpers ───────────────────────────────────────────────────────────────

async function writeDoc(ref: FirebaseFirestore.DocumentReference, data: object) {
  if (IS_DRY_RUN) {
    dryRun(`Would write to ${ref.path}`)
    return
  }
  await ref.set(data, { merge: true })
}

async function updateDoc(ref: FirebaseFirestore.DocumentReference, data: object) {
  if (IS_DRY_RUN) {
    dryRun(`Would update ${ref.path}`)
    return
  }
  await ref.update(data)
}

// ── Step 1: Create PIB platform_owner organization ────────────────────────

async function step1_createPlatformOwnerOrg() {
  log('\n📋 Step 1: Create PIB platform_owner organization')

  const existing = await db.collection('organizations')
    .where('type', '==', 'platform_owner')
    .get()

  if (!existing.empty) {
    info(`Platform owner org already exists (id: ${existing.docs[0].id}) — skipping`)
    return existing.docs[0].id
  }

  const orgData = {
    name: 'Partners in Biz',
    slug: 'partners-in-biz',
    type: 'platform_owner',
    status: 'active',
    description: 'The PIB platform itself — operator access',
    logoUrl: '',
    website: 'https://partnersinbiz.online',
    industry: 'agency',
    createdBy: 'migration-script',
    members: [],
    settings: {
      timezone: 'America/New_York',
      currency: 'USD',
      defaultApprovalRequired: false,
      notificationEmail: 'peet.stander@partnersinbiz.online',
    },
    active: true,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }

  const ref = db.collection('organizations').doc('pib-platform-owner')
  await writeDoc(ref, orgData)
  success(`Created platform_owner org (id: pib-platform-owner)`)
  return 'pib-platform-owner'
}

// ── Step 2: Migrate clients → organizations ───────────────────────────────

async function step2_migrateClients() {
  log('\n📋 Step 2: Migrate clients collection → organizations')

  const clientsSnap = await db.collection('clients').get()
  if (clientsSnap.empty) {
    info('No clients found — skipping')
    return {}
  }

  const mapping: Record<string, string> = {} // clientId → orgId

  for (const doc of clientsSnap.docs) {
    const client = doc.data()
    info(`Processing client: ${client.name || doc.id}`)

    // Check if there's already an org linked to this client
    const linkedOrgSnap = await db.collection('organizations')
      .where('linkedClientId', '==', doc.id)
      .get()

    if (!linkedOrgSnap.empty) {
      const existingOrgId = linkedOrgSnap.docs[0].id
      info(`  → Already linked to org ${existingOrgId} — updating type/status`)
      await updateDoc(linkedOrgSnap.docs[0].ref, {
        type: 'client',
        status: client.status === 'active' ? 'active' : 'churned',
        updatedAt: FieldValue.serverTimestamp(),
      })
      mapping[doc.id] = existingOrgId
    } else {
      // Create a new org for this client
      const slugBase = (client.name || doc.id)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')

      const orgData = {
        name: client.name || 'Unnamed Client',
        slug: slugBase,
        type: 'client',
        status: client.status === 'active' ? 'active' : 'churned',
        description: client.description || '',
        logoUrl: client.logoUrl || '',
        website: client.website || '',
        createdBy: 'migration-script',
        members: client.uid
          ? [{ userId: client.uid, role: 'owner', joinedAt: null }]
          : [],
        settings: {
          timezone: 'America/New_York',
          currency: 'USD',
          defaultApprovalRequired: true,
          notificationEmail: client.email || '',
        },
        active: client.status === 'active',
        linkedClientId: doc.id, // keep legacy link for reference
        createdAt: client.createdAt || FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }

      const newRef = db.collection('organizations').doc()
      await writeDoc(newRef, orgData)
      mapping[doc.id] = newRef.id
      info(`  → Created new org: ${newRef.id} (${orgData.name})`)
    }
  }

  success(`Processed ${clientsSnap.size} clients`)
  return mapping
}

// ── Step 3: Update existing organizations with type/status ────────────────

async function step3_updateExistingOrgs() {
  log('\n📋 Step 3: Update existing organizations with v2 fields')

  const orgsSnap = await db.collection('organizations').get()

  for (const doc of orgsSnap.docs) {
    const org = doc.data()
    const updates: Record<string, unknown> = {}

    if (!org.type) updates.type = 'client'
    if (!org.status) updates.status = org.active !== false ? 'active' : 'churned'
    if (!org.settings) {
      updates.settings = {
        timezone: 'America/New_York',
        currency: 'USD',
        defaultApprovalRequired: true,
        notificationEmail: '',
      }
    }

    if (Object.keys(updates).length > 0) {
      updates.updatedAt = FieldValue.serverTimestamp()
      await updateDoc(doc.ref, updates)
      info(`Updated org: ${org.name || doc.id}`)
    }
  }

  success(`Updated existing organizations`)
}

// ── Step 4: Add orgId to social_posts ────────────────────────────────────

async function step4_scopeSocialPosts(platformOwnerId: string) {
  log('\n📋 Step 4: Add orgId to social_posts')

  const postsSnap = await db.collection('social_posts').where('orgId', '==', null).get()
  // Also get posts without orgId field at all
  const allPostsSnap = await db.collection('social_posts').get()
  let updated = 0

  for (const doc of allPostsSnap.docs) {
    const post = doc.data()
    if (!post.orgId) {
      await updateDoc(doc.ref, {
        orgId: platformOwnerId, // Default to PIB org — admin's posts
        updatedAt: FieldValue.serverTimestamp(),
      })
      updated++
    }
  }

  success(`Added orgId to ${updated} social posts`)
}

// ── Step 5: Scope CRM entities to platform owner org ─────────────────────

async function step5_scopeCrmEntities(platformOwnerId: string) {
  log('\n📋 Step 5: Add orgId to CRM entities (contacts, deals, activities)')

  const collections = ['contacts', 'deals', 'activities', 'emails', 'sequences', 'sequence_enrollments']

  for (const collName of collections) {
    const snap = await db.collection(collName).get()
    let updated = 0

    for (const doc of snap.docs) {
      if (!doc.data().orgId) {
        await updateDoc(doc.ref, {
          orgId: platformOwnerId,
          updatedAt: FieldValue.serverTimestamp(),
        })
        updated++
      }
    }

    if (updated > 0) info(`${collName}: added orgId to ${updated} documents`)
  }

  success('CRM entities scoped to platform owner org')
}

// ── Step 6: Verification report ───────────────────────────────────────────

async function step6_verify() {
  log('\n📋 Step 6: Verification report')

  const collections = [
    'organizations', 'clients', 'contacts', 'deals',
    'activities', 'social_posts', 'projects',
  ]

  for (const collName of collections) {
    const snap = await db.collection(collName).get()
    const missingOrgId = snap.docs.filter(d => !d.data().orgId && collName !== 'organizations' && collName !== 'clients').length
    info(`${collName}: ${snap.size} docs${missingOrgId > 0 ? ` (${missingOrgId} missing orgId ⚠️)` : ' ✅'}`)
  }

  const orgsSnap = await db.collection('organizations').get()
  const byType = orgsSnap.docs.reduce((acc, d) => {
    const t = d.data().type || 'unknown'
    acc[t] = (acc[t] || 0) + 1
    return acc
  }, {} as Record<string, number>)
  info(`Organizations by type: ${JSON.stringify(byType)}`)
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  log('='.repeat(60))
  log(`PIB v2 Migration Script`)
  log(`Mode: ${IS_DRY_RUN ? 'DRY RUN (pass --execute to write)' : '🔴 LIVE EXECUTION'}`)
  log(`Credentials: ${SA_PATH ? `service account file (${SA_PATH})` : 'env vars'}`)
  log('='.repeat(60))

  const platformOwnerId = await step1_createPlatformOwnerOrg()
  const clientMapping = await step2_migrateClients()
  await step3_updateExistingOrgs()
  await step4_scopeSocialPosts(platformOwnerId)
  await step5_scopeCrmEntities(platformOwnerId)
  await step6_verify()

  log('\n' + '='.repeat(60))
  if (IS_DRY_RUN) {
    log('✅ Dry run complete. Review output above, then run with --execute to apply.')
  } else {
    log('✅ Migration complete.')
  }
  log('='.repeat(60))
}

main().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
