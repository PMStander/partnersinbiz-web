/**
 * Register the new `pip` Hermes profile against one or more orgs in Firestore.
 *
 * Adds a row to `hermes_profile_links/{orgId}` so the chat surface routes that
 * org's traffic to the multi-tenant Pip profile on the VPS instead of the
 * legacy `partners-main` profile.
 *
 * Idempotent — re-running on the same orgId updates apiKey/baseUrl in place.
 *
 * Usage:
 *   PIP_API_KEY=<from /etc/hermes/profiles/pip.env on VPS> \
 *   npx tsx scripts/register-pip-profile.ts <orgId> [<orgId> ...]
 *
 *   PIP_API_KEY=xxx \
 *   PIP_BASE_URL=https://hermes-api.partnersinbiz.online/profiles/pip \
 *   npx tsx scripts/register-pip-profile.ts org_abc org_def
 */

import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

;(function loadEnv() {
  const envPath = resolve(process.cwd(), '.env.local')
  if (!existsSync(envPath)) return
  const raw = readFileSync(envPath, 'utf-8')
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
    if (val.startsWith('"') && !val.endsWith('"')) {
      inMultiline = true
      currentKey = key
      currentVal = val
      continue
    }
    val = val.replace(/^"|"$/g, '').replace(/^'|'$/g, '')
    if (!process.env[key]) process.env[key] = val
  }
})()

async function main() {
  const orgIds = process.argv.slice(2).filter(Boolean)
  if (orgIds.length === 0) {
    console.error('Usage: tsx scripts/register-pip-profile.ts <orgId> [<orgId> ...]')
    process.exit(1)
  }

  const apiKey = process.env.PIP_API_KEY
  if (!apiKey) {
    console.error('PIP_API_KEY env var is required (the API_SERVER_KEY from /etc/hermes/profiles/pip.env on the VPS)')
    process.exit(1)
  }

  const baseUrl = process.env.PIP_BASE_URL ?? 'https://hermes-api.partnersinbiz.online/profiles/pip'

  const { adminDb } = await import('@/lib/firebase/admin')
  const { FieldValue } = await import('firebase-admin/firestore')

  for (const orgId of orgIds) {
    const orgSnap = await adminDb.collection('organizations').doc(orgId).get()
    if (!orgSnap.exists) {
      console.warn(`skip ${orgId} — no organization doc found`)
      continue
    }

    await adminDb.collection('hermes_profile_links').doc(orgId).set(
      {
        orgId,
        profile: 'pip',
        baseUrl,
        apiKey,
        enabled: true,
        capabilities: {
          runs: true,
          conversations: true,
          jobs: true,
        },
        permissions: {
          allowApprovalBypass: false,
        },
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: 'scripts/register-pip-profile.ts',
      },
      { merge: true },
    )

    console.log(`registered pip → ${orgId} (${orgSnap.data()?.name ?? '?'})`)
  }

  console.log('\nDone. The next chat opened on /admin/org/<slug>/agent for these orgs will route to pip.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
