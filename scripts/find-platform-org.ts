/**
 * Prints the platform_owner organisation id.
 *
 * The platform_owner org is the one that issues invoices (banking details,
 * from-details, etc.). There is exactly one per workspace. This script
 * queries Firestore for it and prints the id so you can pass it to other
 * scripts (backfill-orgid.ts, etc.).
 *
 * Run: npx tsx scripts/find-platform-org.ts
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
  const snap = await db
    .collection('organizations')
    .where('type', '==', 'platform_owner')
    .limit(2)
    .get()

  if (snap.empty) {
    console.error('No platform_owner organisation found.')
    console.error('Create one first via POST /api/v1/organizations with type: "platform_owner",')
    console.error('or flip an existing org\'s type field to "platform_owner".')
    process.exit(1)
  }

  if (snap.size > 1) {
    console.warn(`WARNING: found ${snap.size} platform_owner orgs — there should be only one.`)
  }

  for (const doc of snap.docs) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = doc.data() as any
    console.log(`${doc.id}  ${d.name ?? '(unnamed)'}  [${d.slug ?? ''}]`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
