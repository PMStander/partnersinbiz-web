/**
 * Seed the "New Lead Welcome" nurture sequence into Firestore.
 *
 * Run:
 *   npx tsx scripts/seed-welcome-sequence.ts
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

  const sequence = {
    name: 'New Lead Welcome',
    description: '3-step welcome sequence for new Partners in Biz leads',
    status: 'active',
    orgId: 'pib-platform-owner',
    steps: [
      {
        delayDays: 0,
        subject: 'Welcome to Partners in Biz',
        bodyText:
          'Hi {firstName}, thanks for your interest in Partners in Biz — the platform that helps SA businesses grow with AI-powered social media automation. Reply to this email if you have any questions.',
        bodyHtml:
          '<p>Hi {firstName},</p><p>Thanks for your interest in <strong>Partners in Biz</strong> — the platform that helps SA businesses grow with AI-powered social media automation.</p><p>Reply to this email if you have any questions.</p>',
      },
      {
        delayDays: 3,
        subject: 'How Partners in Biz works',
        bodyText:
          'Quick overview: connect your social accounts, schedule content, and let our AI handle the rest. Most clients see consistent posting within 24 hours of signing up.',
        bodyHtml:
          '<p>Quick overview: connect your social accounts, schedule content, and let our AI handle the rest.</p><p>Most clients see consistent posting within 24 hours of signing up.</p>',
      },
      {
        delayDays: 7,
        subject: 'Ready to get started?',
        bodyText:
          "If you're ready to take your social media presence seriously, reply to this email and we'll set up a quick call. No pressure, just a conversation.",
        bodyHtml:
          "<p>If you're ready to take your social media presence seriously, reply to this email and we'll set up a quick call. No pressure, just a conversation.</p>",
      },
    ],
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }

  const docRef = await db.collection('sequences').add(sequence)
  console.log(`Welcome sequence created: ${docRef.id}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
