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

  // --- Activities, Tasks, Quotes ---
  // For each, prefer inheriting orgId from the linked record (contactId/dealId/projectId)
  // before falling back to default. Same batched pattern as deals.

  const inferOrgFromContact = (contactId?: string): string =>
    (contactId && contactOrgMap.get(contactId)) || orgId
  const dealOrgMap = new Map<string, string>()
  for (const doc of dealsSnap.docs) {
    const data = doc.data() as { orgId?: string }
    if (data.orgId) dealOrgMap.set(doc.id, data.orgId)
    else dealOrgMap.set(doc.id, orgId)
  }

  // activities: { contactId?, dealId?, orgId? }
  const activitiesSnap = await db.collection('activities').get()
  const activitiesMissing = activitiesSnap.docs.filter((d: any) => !d.data().orgId)
  console.log(`Activities: ${activitiesSnap.size} total, ${activitiesMissing.length} missing orgId`)
  let actBatch = db.batch()
  let actInBatch = 0
  let actWritten = 0
  let actInferred = 0
  for (const doc of activitiesMissing) {
    const data = doc.data() as { contactId?: string; dealId?: string }
    const fromContact = data.contactId ? contactOrgMap.get(data.contactId) : undefined
    const fromDeal = data.dealId ? dealOrgMap.get(data.dealId) : undefined
    const inferred = fromContact ?? fromDeal
    const chosen = inferred ?? orgId
    if (inferred) actInferred++
    actBatch.update(doc.ref, { orgId: chosen, updatedAt: admin.firestore.FieldValue.serverTimestamp() })
    actInBatch++
    if (actInBatch === 400) {
      await actBatch.commit()
      actWritten += actInBatch
      console.log(`  activities: committed ${actWritten}/${activitiesMissing.length}`)
      actBatch = db.batch()
      actInBatch = 0
    }
  }
  if (actInBatch > 0) {
    await actBatch.commit()
    actWritten += actInBatch
  }
  console.log(`  activities: wrote ${actWritten} (${actInferred} inferred, ${actWritten - actInferred} defaulted)`)

  // tasks: top-level + project subcollection. Top-level only here; subcollection
  // tasks live under projects/{id}/tasks and inherit projectOrgId at write time.
  const tasksSnap = await db.collection('tasks').get()
  const tasksMissing = tasksSnap.docs.filter((d: any) => !d.data().orgId)
  console.log(`Tasks (top-level): ${tasksSnap.size} total, ${tasksMissing.length} missing orgId`)
  let taskBatch = db.batch()
  let taskInBatch = 0
  let taskWritten = 0
  for (const doc of tasksMissing) {
    taskBatch.update(doc.ref, { orgId, updatedAt: admin.firestore.FieldValue.serverTimestamp() })
    taskInBatch++
    if (taskInBatch === 400) {
      await taskBatch.commit()
      taskWritten += taskInBatch
      console.log(`  tasks: committed ${taskWritten}/${tasksMissing.length}`)
      taskBatch = db.batch()
      taskInBatch = 0
    }
  }
  if (taskInBatch > 0) {
    await taskBatch.commit()
    taskWritten += taskInBatch
  }
  console.log(`  tasks: wrote ${taskWritten}`)

  // quotes: { contactId?, dealId?, orgId? }
  const quotesSnap = await db.collection('quotes').get()
  const quotesMissing = quotesSnap.docs.filter((d: any) => !d.data().orgId)
  console.log(`Quotes: ${quotesSnap.size} total, ${quotesMissing.length} missing orgId`)
  let quoteBatch = db.batch()
  let quoteInBatch = 0
  let quoteWritten = 0
  let quoteInferred = 0
  for (const doc of quotesMissing) {
    const data = doc.data() as { contactId?: string; dealId?: string }
    const fromContact = data.contactId ? contactOrgMap.get(data.contactId) : undefined
    const fromDeal = data.dealId ? dealOrgMap.get(data.dealId) : undefined
    const inferred = fromContact ?? fromDeal
    const chosen = inferred ?? orgId
    if (inferred) quoteInferred++
    quoteBatch.update(doc.ref, { orgId: chosen, updatedAt: admin.firestore.FieldValue.serverTimestamp() })
    quoteInBatch++
    if (quoteInBatch === 400) {
      await quoteBatch.commit()
      quoteWritten += quoteInBatch
      console.log(`  quotes: committed ${quoteWritten}/${quotesMissing.length}`)
      quoteBatch = db.batch()
      quoteInBatch = 0
    }
  }
  if (quoteInBatch > 0) {
    await quoteBatch.commit()
    quoteWritten += quoteInBatch
  }
  console.log(`  quotes: wrote ${quoteWritten} (${quoteInferred} inferred, ${quoteWritten - quoteInferred} defaulted)`)

  // ── Email + Sequences (Phase 1 campaign system) ─────────────────────────
  // emails: { contactId?, sequenceId?, orgId? } — prefer contact's orgId
  const emailsSnap = await db.collection('emails').get()
  const emailsMissing = emailsSnap.docs.filter((d: any) => !d.data().orgId)
  console.log(`Emails: ${emailsSnap.size} total, ${emailsMissing.length} missing orgId`)
  let emailBatch = db.batch()
  let emailInBatch = 0
  let emailWritten = 0
  let emailInferred = 0
  for (const doc of emailsMissing) {
    const data = doc.data() as { contactId?: string }
    const fromContact = data.contactId ? contactOrgMap.get(data.contactId) : undefined
    const chosen = fromContact ?? orgId
    if (fromContact) emailInferred++
    emailBatch.update(doc.ref, {
      orgId: chosen,
      campaignId: doc.data().campaignId ?? '',
      fromDomainId: doc.data().fromDomainId ?? '',
      bouncedAt: doc.data().bouncedAt ?? null,
    })
    emailInBatch++
    if (emailInBatch === 400) {
      await emailBatch.commit()
      emailWritten += emailInBatch
      console.log(`  emails: committed ${emailWritten}/${emailsMissing.length}`)
      emailBatch = db.batch()
      emailInBatch = 0
    }
  }
  if (emailInBatch > 0) {
    await emailBatch.commit()
    emailWritten += emailInBatch
  }
  console.log(`  emails: wrote ${emailWritten} (${emailInferred} inferred, ${emailWritten - emailInferred} defaulted)`)

  // sequences: { orgId? } — default to platform org
  const sequencesSnap = await db.collection('sequences').get()
  const sequencesMissing = sequencesSnap.docs.filter((d: any) => !d.data().orgId)
  console.log(`Sequences: ${sequencesSnap.size} total, ${sequencesMissing.length} missing orgId`)
  let seqBatch = db.batch()
  let seqInBatch = 0
  let seqWritten = 0
  for (const doc of sequencesMissing) {
    seqBatch.update(doc.ref, { orgId, updatedAt: admin.firestore.FieldValue.serverTimestamp() })
    seqInBatch++
    if (seqInBatch === 400) {
      await seqBatch.commit()
      seqWritten += seqInBatch
      seqBatch = db.batch()
      seqInBatch = 0
    }
  }
  if (seqInBatch > 0) {
    await seqBatch.commit()
    seqWritten += seqInBatch
  }
  console.log(`  sequences: wrote ${seqWritten}`)

  // Build sequence → orgId map for enrollment inference (post-backfill)
  const sequenceOrgMap = new Map<string, string>()
  for (const doc of sequencesSnap.docs) {
    const data = doc.data() as { orgId?: string }
    sequenceOrgMap.set(doc.id, data.orgId ?? orgId)
  }

  // sequence_enrollments: prefer sequence's orgId, then contact's
  const enrollSnap = await db.collection('sequence_enrollments').get()
  const enrollMissing = enrollSnap.docs.filter((d: any) => !d.data().orgId)
  console.log(`Sequence enrollments: ${enrollSnap.size} total, ${enrollMissing.length} missing orgId`)
  let enrollBatch = db.batch()
  let enrollInBatch = 0
  let enrollWritten = 0
  let enrollInferred = 0
  for (const doc of enrollMissing) {
    const data = doc.data() as { sequenceId?: string; contactId?: string }
    const fromSeq = data.sequenceId ? sequenceOrgMap.get(data.sequenceId) : undefined
    const fromContact = data.contactId ? contactOrgMap.get(data.contactId) : undefined
    const inferred = fromSeq ?? fromContact
    const chosen = inferred ?? orgId
    if (inferred) enrollInferred++
    enrollBatch.update(doc.ref, { orgId: chosen, campaignId: doc.data().campaignId ?? '' })
    enrollInBatch++
    if (enrollInBatch === 400) {
      await enrollBatch.commit()
      enrollWritten += enrollInBatch
      enrollBatch = db.batch()
      enrollInBatch = 0
    }
  }
  if (enrollInBatch > 0) {
    await enrollBatch.commit()
    enrollWritten += enrollInBatch
  }
  console.log(`  enrollments: wrote ${enrollWritten} (${enrollInferred} inferred, ${enrollWritten - enrollInferred} defaulted)`)

  console.log('\nBackfill complete.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
