/**
 * One-off: remap test sprint from `orgId: "partnersinbiz"` to the real
 * Firestore org doc id `pib-platform-owner` (and `clientId` to match), so it
 * shows up in the sidebar when Partners in Biz is selected in the org switcher.
 *
 * Updates the sprint, all its tasks, and all its backlinks in batched writes.
 *
 * Run from partnersinbiz-web/:
 *   node --env-file=.env.local scripts/remap-sprint-orgid.mjs
 */
import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const SPRINT_ID = '3ar6t2MkzdRZWhJEGsnu'
const OLD_ORG_ID = 'partnersinbiz'
const NEW_ORG_ID = 'pib-platform-owner'

initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_ADMIN_PROJECT_ID?.trim(),
    clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL?.trim(),
    privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n').trim(),
  }),
})

const db = getFirestore()

async function main() {
  // 1. Sprint
  const sprintRef = db.collection('seo_sprints').doc(SPRINT_ID)
  const sprintSnap = await sprintRef.get()
  if (!sprintSnap.exists) {
    console.error(`Sprint ${SPRINT_ID} not found`)
    process.exit(1)
  }
  const sprint = sprintSnap.data()
  console.log(`Sprint: ${sprint.siteName} (orgId=${sprint.orgId}, clientId=${sprint.clientId})`)

  if (sprint.orgId !== OLD_ORG_ID) {
    console.log(`Sprint orgId is already "${sprint.orgId}", not "${OLD_ORG_ID}". Aborting.`)
    process.exit(0)
  }

  await sprintRef.update({ orgId: NEW_ORG_ID, clientId: NEW_ORG_ID })
  console.log(`✓ Sprint updated`)

  // 2. Tasks
  const tasksSnap = await db.collection('seo_tasks').where('sprintId', '==', SPRINT_ID).get()
  console.log(`Tasks to update: ${tasksSnap.size}`)
  let updated = 0
  for (let i = 0; i < tasksSnap.docs.length; i += 400) {
    const batch = db.batch()
    const slice = tasksSnap.docs.slice(i, i + 400)
    for (const doc of slice) {
      batch.update(doc.ref, { orgId: NEW_ORG_ID })
    }
    await batch.commit()
    updated += slice.length
  }
  console.log(`✓ ${updated} tasks updated`)

  // 3. Backlinks
  const blSnap = await db.collection('seo_backlinks').where('sprintId', '==', SPRINT_ID).get()
  console.log(`Backlinks to update: ${blSnap.size}`)
  let blUpdated = 0
  for (let i = 0; i < blSnap.docs.length; i += 400) {
    const batch = db.batch()
    const slice = blSnap.docs.slice(i, i + 400)
    for (const doc of slice) {
      batch.update(doc.ref, { orgId: NEW_ORG_ID })
    }
    await batch.commit()
    blUpdated += slice.length
  }
  console.log(`✓ ${blUpdated} backlinks updated`)

  // 4. Keywords + content (in case anything was seeded)
  for (const col of ['seo_keywords', 'seo_content', 'seo_audits', 'seo_optimizations']) {
    const snap = await db.collection(col).where('sprintId', '==', SPRINT_ID).get()
    if (snap.size === 0) continue
    let n = 0
    for (let i = 0; i < snap.docs.length; i += 400) {
      const batch = db.batch()
      const slice = snap.docs.slice(i, i + 400)
      for (const doc of slice) batch.update(doc.ref, { orgId: NEW_ORG_ID })
      await batch.commit()
      n += slice.length
    }
    console.log(`✓ ${n} ${col} updated`)
  }

  console.log('\nDone. Sprint is now scoped to Partners in Biz (pib-platform-owner).')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
