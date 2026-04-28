/**
 * Seed the Partners in Biz brand profile into the platform owner org.
 *
 * Run:
 *   npx tsx scripts/seed-pib-brand.ts
 */

import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

// ---------------------------------------------------------------------------
// Load .env.local before importing firebase-admin
// ---------------------------------------------------------------------------
;(function loadEnv() {
  const envPath = resolve(process.cwd(), '.env.local')
  if (!existsSync(envPath)) return
  const raw = readFileSync(envPath, 'utf-8')
  // Multi-line values (e.g. private key) need special handling
  const lines = raw.split('\n')
  let currentKey = ''
  let currentVal = ''
  let inMultiline = false

  for (const line of lines) {
    if (inMultiline) {
      currentVal += '\n' + line
      if (line.includes('"')) {
        inMultiline = false
        const val = currentVal.replace(/^"|"$/g, '').replace(/\\n/g, '\n')
        if (!process.env[currentKey]) process.env[currentKey] = val
        currentKey = ''
        currentVal = ''
      }
      continue
    }

    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue

    const key = trimmed.slice(0, eqIdx).trim()
    let val = trimmed.slice(eqIdx + 1).trim()

    // Detect start of a multi-line quoted value
    if (val.startsWith('"') && !val.slice(1).includes('"')) {
      currentKey = key
      currentVal = val
      inMultiline = true
      continue
    }

    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }

    if (!process.env[key]) process.env[key] = val
  }
})()

// eslint-disable-next-line @typescript-eslint/no-require-imports
const admin = require('firebase-admin')

// ---------------------------------------------------------------------------
// Firebase init — mirrors lib/firebase/admin.ts approach
// ---------------------------------------------------------------------------
function initFirebase() {
  if (admin.apps.length > 0) return admin.firestore()

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n')

  if (projectId && clientEmail && privateKey) {
    admin.initializeApp({
      credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    })
  } else {
    // Fall back to application default credentials (gcloud auth)
    admin.initializeApp()
  }

  return admin.firestore()
}

// ---------------------------------------------------------------------------
// Brand profile
// ---------------------------------------------------------------------------
const pibBrand = {
  logoUrl: '/pib-logo-512.png',
  logoMarkUrl: '/pib-logo-512.png',
  tagline: 'Grow your business with AI-powered client management',
  toneOfVoice: 'Professional yet approachable. Clear, direct, and confident. Avoid jargon.',
  targetAudience: 'Small to medium business owners and founders',
  doWords: ['grow', 'streamline', 'automate', 'connect', 'build', 'scale'],
  dontWords: ['cheap', 'hack', 'quick fix', 'guaranteed'],
  fonts: { heading: 'Inter', body: 'DM Sans' },
  socialHandles: {
    twitter: '@partnersinbiz',
    linkedin: 'company/partners-in-biz',
    instagram: '@partnersinbiz',
  },
  guidelines: 'Always lead with value. Focus on business growth outcomes, not features.',
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const db = initFirebase()

  const snapshot = await db.collection('organizations').get()

  if (snapshot.empty) {
    console.error('No organizations found in Firestore.')
    process.exit(1)
  }

  // Prefer an org whose name contains "Partners in Biz", otherwise take the first
  let targetDoc = snapshot.docs.find((doc: { data: () => { name?: string } }) => {
    const name: string = doc.data()?.name ?? ''
    return name.toLowerCase().includes('partners in biz')
  })

  if (!targetDoc) {
    targetDoc = snapshot.docs[0]
    console.log(`No org named "Partners in Biz" found — using first org instead.`)
  }

  const orgData = targetDoc.data()
  const orgName: string = orgData?.name ?? '(unnamed)'
  const orgId: string = targetDoc.id

  console.log(`Updating brandProfile for org: "${orgName}" (${orgId})`)

  await db.collection('organizations').doc(orgId).update({
    brandProfile: pibBrand,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  })

  console.log(`Done. brandProfile set on org "${orgName}" (${orgId}).`)
}

main().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
