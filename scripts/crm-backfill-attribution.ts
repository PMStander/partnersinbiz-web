#!/usr/bin/env tsx
/**
 * One-shot backfill: adds createdByRef / updatedByRef to legacy CRM records.
 *
 * Targets: contacts, deals, activities, segments, capture_sources, quotes,
 *          forms, form_submissions
 *
 * Idempotent: records that already have createdByRef are skipped.
 *
 * Usage:
 *   npx tsx scripts/crm-backfill-attribution.ts                 # dry-run
 *   npx tsx scripts/crm-backfill-attribution.ts --commit        # actually write
 *   npx tsx scripts/crm-backfill-attribution.ts --org-id foo    # one org only
 *   npx tsx scripts/crm-backfill-attribution.ts --collection contacts
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs'
import { resolve } from 'path'
import {
  LEGACY_REF,
  FORMER_MEMBER_REF,
  type MemberRef,
} from '@/lib/orgMembers/memberRef'

const COLLECTIONS = [
  'contacts',
  'deals',
  'activities',
  'segments',
  'capture_sources',
  'quotes',
  'forms',
  'form_submissions',
] as const

export type TargetCollection = (typeof COLLECTIONS)[number]

export interface AttributionPatch {
  createdByRef: MemberRef
  updatedByRef: MemberRef
}

export type MemberLookup = (orgId: string, uid: string) => Promise<MemberRef | null>

/**
 * Pure decision function — exported for unit tests. Given a record's current
 * shape + an injected lookup, return the patch to apply (or null to skip).
 */
export async function decideAttribution(
  record: { createdByRef?: unknown; createdBy?: string; updatedBy?: string; [key: string]: unknown },
  orgId: string,
  lookupMember: MemberLookup,
): Promise<AttributionPatch | null> {
  if (record.createdByRef) return null

  let createdByRef: MemberRef
  if (record.createdBy) {
    createdByRef = (await lookupMember(orgId, record.createdBy)) ?? FORMER_MEMBER_REF(record.createdBy)
  } else {
    createdByRef = LEGACY_REF
  }

  let updatedByRef: MemberRef
  if (record.updatedBy) {
    updatedByRef = (await lookupMember(orgId, record.updatedBy)) ?? FORMER_MEMBER_REF(record.updatedBy)
  } else {
    updatedByRef = createdByRef
  }

  return { createdByRef, updatedByRef }
}

// ---- CLI ----

interface CliFlags {
  dryRun: boolean
  orgId?: string
  collection?: TargetCollection
  batchSize: number
}

function parseFlags(argv: string[]): CliFlags {
  const flags: CliFlags = { dryRun: true, batchSize: 200 }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--commit') flags.dryRun = false
    else if (a === '--dry-run') flags.dryRun = true
    else if (a === '--org-id') flags.orgId = argv[++i]
    else if (a === '--collection') flags.collection = argv[++i] as TargetCollection
    else if (a === '--batch-size') flags.batchSize = parseInt(argv[++i] ?? '200', 10)
  }
  return flags
}

interface CsvRow {
  collection: string
  orgId: string
  resolved_real_member: number
  resolved_former_member: number
  resolved_legacy: number
  skipped_already_present: number
}

function loadEnv() {
  const envPath = resolve(process.cwd(), '.env.local')
  if (!existsSync(envPath)) return
  const content = readFileSync(envPath, 'utf8')
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 0) continue
    const k = trimmed.slice(0, eq).trim()
    const v = trimmed.slice(eq + 1).trim().replace(/^"|"$/g, '').replace(/^'|'$/g, '')
    if (!process.env[k]) process.env[k] = v
  }
}

async function main() {
  const flags = parseFlags(process.argv.slice(2))
  loadEnv()

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const admin = require('firebase-admin')
  if (admin.apps.length === 0) {
    const keyPath = resolve(process.cwd(), 'service-account.json')
    if (existsSync(keyPath)) {
      admin.initializeApp({ credential: admin.credential.cert(require(keyPath)) })
    } else {
      admin.initializeApp({ credential: admin.credential.applicationDefault() })
    }
  }
  const db = admin.firestore() as FirebaseFirestore.Firestore

  const lookupCache = new Map<string, MemberRef | null>()
  const lookupMember: MemberLookup = async (orgId, uid) => {
    const key = `${orgId}_${uid}`
    if (lookupCache.has(key)) return lookupCache.get(key)!
    const snap = await db.collection('orgMembers').doc(key).get()
    if (!snap.exists) {
      lookupCache.set(key, null)
      return null
    }
    const data = snap.data() ?? {}
    const firstName = (data.firstName as string | undefined) ?? ''
    const lastName = (data.lastName as string | undefined) ?? ''
    const ref: MemberRef = {
      uid,
      displayName: [firstName, lastName].filter(Boolean).join(' ') || uid,
      kind: 'human',
    }
    if (data.jobTitle) ref.jobTitle = data.jobTitle as string
    if (data.avatarUrl) ref.avatarUrl = data.avatarUrl as string
    lookupCache.set(key, ref)
    return ref
  }

  const rows: CsvRow[] = []
  const targetCollections = flags.collection ? [flags.collection] : COLLECTIONS

  for (const coll of targetCollections) {
    let query: FirebaseFirestore.Query = db.collection(coll)
    if (flags.orgId) query = query.where('orgId', '==', flags.orgId)

    const counts = new Map<string, CsvRow>()
    const snap = await query.get()
    console.log(`[${coll}] scanning ${snap.size} docs (dry-run=${flags.dryRun})`)

    let batch = db.batch()
    let inBatch = 0

    for (const doc of snap.docs) {
      const data = doc.data() as Record<string, unknown>
      const orgId = (data.orgId as string | undefined) ?? '__unknown__'
      const row = counts.get(orgId) ?? {
        collection: coll,
        orgId,
        resolved_real_member: 0,
        resolved_former_member: 0,
        resolved_legacy: 0,
        skipped_already_present: 0,
      }

      const patch = await decideAttribution(data as Parameters<typeof decideAttribution>[0], orgId, lookupMember)
      if (!patch) {
        row.skipped_already_present++
      } else if (patch.createdByRef === LEGACY_REF) {
        row.resolved_legacy++
      } else if (patch.createdByRef.kind === 'human') {
        row.resolved_real_member++
      } else {
        row.resolved_former_member++
      }
      counts.set(orgId, row)

      if (patch && !flags.dryRun) {
        batch.update(doc.ref, patch as unknown as Record<string, unknown>)
        inBatch++
        if (inBatch >= flags.batchSize) {
          await batch.commit()
          batch = db.batch()
          inBatch = 0
        }
      }
    }
    if (!flags.dryRun && inBatch > 0) await batch.commit()
    rows.push(...counts.values())
  }

  const reportDir = resolve(process.cwd(), 'scripts/crm-backfill-reports')
  if (!existsSync(reportDir)) mkdirSync(reportDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16)
  const reportPath = resolve(reportDir, `${stamp}-${flags.dryRun ? 'dryrun' : 'commit'}.csv`)
  const header = 'collection,orgId,resolved_real_member,resolved_former_member,resolved_legacy,skipped_already_present\n'
  const body = rows
    .map((r) =>
      [r.collection, r.orgId, r.resolved_real_member, r.resolved_former_member, r.resolved_legacy, r.skipped_already_present].join(','),
    )
    .join('\n')
  writeFileSync(reportPath, header + body + '\n')
  console.log(`\nReport: ${reportPath}`)
  console.log(`Mode: ${flags.dryRun ? 'DRY-RUN (no writes)' : 'COMMITTED'}`)
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
if (require.main === module) main()
