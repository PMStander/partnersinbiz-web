/**
 * Backfill missing orgId on legacy contacts and deals.
 *
 * After 2026-04-16, POST /crm/contacts and POST /crm/deals require orgId.
 * Pre-existing docs written without orgId still exist and don't dispatch
 * webhooks or show up in org-scoped reports. This script assigns a default
 * orgId to those docs.
 *
 * Strategy:
 *   1. Deals: try to inherit orgId from the linked contact. If the contact
 *      has no orgId either, fall back to the supplied default.
 *   2. Contacts: assign the supplied default orgId.
 *
 * Run DRY-RUN (reports counts, writes nothing):
 *   npx tsx scripts/backfill-orgid.ts <default-org-id>
 *
 * Execute writes:
 *   npx tsx scripts/backfill-orgid.ts <default-org-id> --apply
 */

import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

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
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = val
  }
})()

// eslint-disable-next-line @typescript-eslint/no-require-imports
const admin = require('firebase-admin')

const args = process.argv.slice(2)
let defaultOrgId = args.find((a) => !a.startsWith('--'))
const apply = args.includes('--apply')

function initFirebase() {
  if (admin.apps.length > 0) return admin.firestore()
  const keyPath = resolve(process.cwd(), 'service-account.json')
  if (existsSync(keyPath)) {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(readFileSync(keyPath, 'utf-8'))),
    })
    return admin.firestore()
  }
  admin.initializeApp()
  return admin.firestore()
}

async function main() {
  const db = initFirebase()

  // If no orgId was supplied, auto-detect the platform_owner org.
  if (!defaultOrgId) {
    const snap = await db
      .collection('organizations')
      .where('type', '==', 'platform_owner')
      .limit(2)
      .get()
    if (snap.empty) {
      console.error('No orgId provided and no platform_owner org found.')
      console.error('usage: npx tsx scripts/backfill-orgid.ts [default-org-id] [--apply]')
      process.exit(1)
    }
    if (snap.size > 1) {
      console.warn(`WARNING: multiple platform_owner orgs; using first (${snap.docs[0].id}).`)
    }
    defaultOrgId = snap.docs[0].id
    console.log(`Auto-detected platform_owner org: ${defaultOrgId}`)
  }

  const orgId = defaultOrgId as string
  console.log(`\nBackfill orgId — ${apply ? 'APPLY (writes)' : 'DRY-RUN (reads only)'}`)
  console.log(`Default orgId: ${orgId}\n`)

  // Verify the default org exists
  const orgDoc = await db.collection('organizations').doc(orgId).get()
  if (!orgDoc.exists) {
    console.error(`ERROR: default org ${orgId} not found`)
    process.exit(1)
  }
  console.log(`Default org: ${orgDoc.data()?.name} (${orgDoc.data()?.type})\n`)

  // --- Contacts ---
  const contactsSnap = await db.collection('contacts').get()
  const contactsMissing = contactsSnap.docs.filter((d: any) => !d.data().orgId)
  console.log(`Contacts: ${contactsSnap.size} total, ${contactsMissing.length} missing orgId`)

  // Build contactId → orgId map for deal inference
  const contactOrgMap = new Map<string, string>()
  for (const doc of contactsSnap.docs) {
    const data = doc.data() as { orgId?: string }
    if (data.orgId) contactOrgMap.set(doc.id, data.orgId)
    else contactOrgMap.set(doc.id, orgId) // post-backfill
  }

  // --- Deals ---
  const dealsSnap = await db.collection('deals').get()
  const dealsMissing = dealsSnap.docs.filter((d: any) => !d.data().orgId)
  console.log(`Deals: ${dealsSnap.size} total, ${dealsMissing.length} missing orgId\n`)

  if (!apply) {
    console.log('Dry run complete. Re-run with --apply to write changes.')
    return
  }

  // --- Write contacts ---
  let contactsBatch = db.batch()
  let contactsInBatch = 0
  let contactsWritten = 0
  for (const doc of contactsMissing) {
    contactsBatch.update(doc.ref, { orgId, updatedAt: admin.firestore.FieldValue.serverTimestamp() })
    contactsInBatch++
    if (contactsInBatch === 400) {
      await contactsBatch.commit()
      contactsWritten += contactsInBatch
      console.log(`  contacts: committed ${contactsWritten}/${contactsMissing.length}`)
      contactsBatch = db.batch()
      contactsInBatch = 0
    }
  }
  if (contactsInBatch > 0) {
    await contactsBatch.commit()
    contactsWritten += contactsInBatch
  }
  console.log(`  contacts: wrote ${contactsWritten}`)

  // --- Write deals ---
  let dealsBatch = db.batch()
  let dealsInBatch = 0
  let dealsWritten = 0
  let dealsInferred = 0
  for (const doc of dealsMissing) {
    const data = doc.data() as { contactId?: string }
    const inferredOrgId = data.contactId ? contactOrgMap.get(data.contactId) : undefined
    const chosen = inferredOrgId ?? orgId
    if (inferredOrgId) dealsInferred++
    dealsBatch.update(doc.ref, { orgId: chosen, updatedAt: admin.firestore.FieldValue.serverTimestamp() })
    dealsInBatch++
    if (dealsInBatch === 400) {
      await dealsBatch.commit()
      dealsWritten += dealsInBatch
      console.log(`  deals: committed ${dealsWritten}/${dealsMissing.length}`)
      dealsBatch = db.batch()
      dealsInBatch = 0
    }
  }
  if (dealsInBatch > 0) {
    await dealsBatch.commit()
    dealsWritten += dealsInBatch
  }
  console.log(`  deals: wrote ${dealsWritten} (${dealsInferred} inferred from contact, ${dealsWritten - dealsInferred} defaulted)`)

  console.log('\nBackfill complete.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
