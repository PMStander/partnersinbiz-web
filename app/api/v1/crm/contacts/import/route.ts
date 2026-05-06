/**
 * POST /api/v1/crm/contacts/import — bulk-create contacts from a parsed CSV.
 *
 * Body:
 *   {
 *     orgId: string                 // required
 *     capturedFromId?: string       // CaptureSource id (must be type='csv' for clarity)
 *     rows: Array<{
 *       email: string               // required
 *       name?: string
 *       firstName?: string
 *       lastName?: string
 *       company?: string
 *       phone?: string
 *       tags?: string[]
 *       notes?: string
 *     }>
 *     defaultTags?: string[]        // merged with each row's tags
 *     dryRun?: boolean              // when true, validate + return preview without writing
 *   }
 *
 * Returns: { created, updated, skipped, invalidRows: [{ index, reason }] }
 *          dryRun mode also returns: previewSample (first 3 normalized rows)
 *
 * Auth: admin (or ai)
 *
 * Notes:
 * - Existing contacts (by orgId+email) get tag-merge only — no name/company overwrite.
 * - autoTags from the supplied capture source are merged in (if same org).
 * - source.capturedCount bumps by `created` only (not by updates).
 * - Auto-enroll behavior is OUT OF SCOPE — CSV imports skip campaign enrollment to
 *   avoid surprise sends.
 */
import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { resolveOrgScope } from '@/lib/api/orgScope'
import { apiSuccess, apiError } from '@/lib/api/response'

const MAX_ROWS = 5000
const BATCH_CHUNK = 400

interface ImportRow {
  email: string
  name?: string
  firstName?: string
  lastName?: string
  company?: string
  phone?: string
  tags?: string[]
  notes?: string
}

interface InvalidRow {
  index: number
  reason: string
}

interface NormalizedRow {
  index: number
  email: string
  name: string
  company: string
  phone: string
  tags: string[]
  notes: string
}

function isValidEmail(e: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)
}

function uniqueTags(...lists: Array<unknown>): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const list of lists) {
    if (!Array.isArray(list)) continue
    for (const raw of list) {
      if (typeof raw !== 'string') continue
      const t = raw.trim()
      if (!t) continue
      const key = t.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(t)
    }
  }
  return out
}

function deriveName(row: ImportRow): string {
  const name = (row.name ?? '').trim()
  if (name) return name
  const first = (row.firstName ?? '').trim()
  const last = (row.lastName ?? '').trim()
  const combined = `${first} ${last}`.trim()
  return combined
}

export const POST = withAuth('client', async (req: NextRequest, user) => {
  const body = await req.json().catch(() => null) as
    | {
        orgId?: string
        capturedFromId?: string
        rows?: ImportRow[]
        defaultTags?: string[]
        dryRun?: boolean
      }
    | null

  if (!body) return apiError('Invalid JSON', 400)

  const requestedOrgId = typeof body.orgId === 'string' ? body.orgId.trim() : null
  const scope = resolveOrgScope(user, requestedOrgId)
  if (!scope.ok) return apiError(scope.error, scope.status)
  const orgId = scope.orgId

  if (!Array.isArray(body.rows)) return apiError('rows must be an array', 400)
  if (body.rows.length === 0) return apiError('rows must not be empty', 400)
  if (body.rows.length > MAX_ROWS) {
    return apiError(`rows exceeds maximum of ${MAX_ROWS}`, 400)
  }

  const capturedFromId =
    typeof body.capturedFromId === 'string' ? body.capturedFromId.trim() : ''
  const defaultTags = Array.isArray(body.defaultTags) ? body.defaultTags : []
  const dryRun = body.dryRun === true

  // Resolve capture source autoTags (and confirm same org). If the source
  // doesn't belong to the org, we silently ignore it (don't apply autoTags
  // and don't bump its counter), but still keep capturedFromId on the row
  // metadata so the import isn't silently dropped on a typo. Actually —
  // safer to clear it instead.
  let sourceAutoTags: string[] = []
  let sourceRef: FirebaseFirestore.DocumentReference | null = null
  let effectiveCapturedFromId = ''
  if (capturedFromId) {
    const sourceSnap = await adminDb
      .collection('capture_sources')
      .doc(capturedFromId)
      .get()
    if (sourceSnap.exists) {
      const sourceData = sourceSnap.data() ?? {}
      if (sourceData.orgId === orgId) {
        sourceAutoTags = Array.isArray(sourceData.autoTags) ? sourceData.autoTags : []
        sourceRef = sourceSnap.ref
        effectiveCapturedFromId = capturedFromId
      }
    }
  }

  // Validate + normalize rows
  const invalidRows: InvalidRow[] = []
  const normalized: NormalizedRow[] = []
  const seenEmailsInPayload = new Set<string>()

  for (let i = 0; i < body.rows.length; i++) {
    const raw = body.rows[i]
    if (!raw || typeof raw !== 'object') {
      invalidRows.push({ index: i, reason: 'row is not an object' })
      continue
    }
    const emailRaw = typeof raw.email === 'string' ? raw.email.trim().toLowerCase() : ''
    if (!emailRaw) {
      invalidRows.push({ index: i, reason: 'email is required' })
      continue
    }
    if (!isValidEmail(emailRaw)) {
      invalidRows.push({ index: i, reason: 'email is invalid' })
      continue
    }
    if (seenEmailsInPayload.has(emailRaw)) {
      invalidRows.push({ index: i, reason: 'duplicate email in payload' })
      continue
    }
    seenEmailsInPayload.add(emailRaw)

    const tags = uniqueTags(raw.tags, defaultTags, sourceAutoTags)

    normalized.push({
      index: i,
      email: emailRaw,
      name: deriveName(raw),
      company: typeof raw.company === 'string' ? raw.company.trim() : '',
      phone: typeof raw.phone === 'string' ? raw.phone.trim() : '',
      tags,
      notes: typeof raw.notes === 'string' ? raw.notes.trim() : '',
    })
  }

  if (normalized.length === 0) {
    return apiSuccess({
      created: 0,
      updated: 0,
      skipped: invalidRows.length,
      invalidRows,
      ...(dryRun ? { previewSample: [] } : {}),
    })
  }

  // Look up existing contacts in the org by email. Firestore `in` queries
  // accept up to 30 values per query, so we chunk.
  const emailToExisting = new Map<
    string,
    { id: string; ref: FirebaseFirestore.DocumentReference; tags: string[] }
  >()
  const emails = normalized.map((n) => n.email)
  const IN_CHUNK = 30
  for (let i = 0; i < emails.length; i += IN_CHUNK) {
    const slice = emails.slice(i, i + IN_CHUNK)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const snap = await (adminDb.collection('contacts') as any)
      .where('orgId', '==', orgId)
      .where('email', 'in', slice)
      .get()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const doc of snap.docs as any[]) {
      const data = doc.data() ?? {}
      if (data.deleted === true) continue
      const email = typeof data.email === 'string' ? data.email.toLowerCase() : ''
      if (!email) continue
      emailToExisting.set(email, {
        id: doc.id,
        ref: doc.ref,
        tags: Array.isArray(data.tags) ? data.tags : [],
      })
    }
  }

  // Partition into create-vs-update plans
  const toCreate: NormalizedRow[] = []
  const toUpdate: Array<{
    row: NormalizedRow
    ref: FirebaseFirestore.DocumentReference
    mergedTags: string[]
  }> = []

  for (const row of normalized) {
    const existing = emailToExisting.get(row.email)
    if (existing) {
      const mergedTags = uniqueTags(existing.tags, row.tags)
      // Skip the write if no new tags were added.
      if (mergedTags.length === existing.tags.length) {
        // Still count as "updated" only when we'd change something.
        // Treat no-op as updated=0 for this row by skipping push.
        continue
      }
      toUpdate.push({ row, ref: existing.ref, mergedTags })
    } else {
      toCreate.push(row)
    }
  }

  if (dryRun) {
    return apiSuccess({
      created: toCreate.length,
      updated: toUpdate.length,
      skipped: invalidRows.length,
      invalidRows,
      previewSample: normalized.slice(0, 4).map((r) => ({
        index: r.index,
        email: r.email,
        name: r.name,
        company: r.company,
        phone: r.phone,
        tags: r.tags,
        notes: r.notes,
        capturedFromId: effectiveCapturedFromId,
      })),
    })
  }

  // Commit in chunks of BATCH_CHUNK writes per batch.
  const contactsCol = adminDb.collection('contacts')
  type Op =
    | { kind: 'create'; ref: FirebaseFirestore.DocumentReference; row: NormalizedRow }
    | { kind: 'update'; ref: FirebaseFirestore.DocumentReference; mergedTags: string[] }
  const ops: Op[] = []

  for (const row of toCreate) {
    ops.push({ kind: 'create', ref: contactsCol.doc(), row })
  }
  for (const upd of toUpdate) {
    ops.push({ kind: 'update', ref: upd.ref, mergedTags: upd.mergedTags })
  }

  for (let i = 0; i < ops.length; i += BATCH_CHUNK) {
    const slice = ops.slice(i, i + BATCH_CHUNK)
    const batch = adminDb.batch()
    for (const op of slice) {
      if (op.kind === 'create') {
        batch.set(op.ref, {
          orgId,
          capturedFromId: effectiveCapturedFromId,
          name: op.row.name,
          email: op.row.email,
          phone: op.row.phone,
          company: op.row.company,
          website: '',
          source: 'import' as const,
          type: 'lead' as const,
          stage: 'new' as const,
          tags: op.row.tags,
          notes: op.row.notes,
          assignedTo: '',
          deleted: false,
          subscribedAt: FieldValue.serverTimestamp(),
          unsubscribedAt: null,
          bouncedAt: null,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          lastContactedAt: null,
        })
      } else {
        batch.update(op.ref, {
          tags: op.mergedTags,
          updatedAt: FieldValue.serverTimestamp(),
        })
      }
    }
    await batch.commit()
  }

  // Bump source counter by `created` only.
  if (sourceRef && toCreate.length > 0) {
    try {
      await sourceRef.update({
        capturedCount: FieldValue.increment(toCreate.length),
        lastCapturedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      })
    } catch (err) {
      console.error('[contacts-import] failed to bump source counter', err)
    }
  }

  return apiSuccess({
    created: toCreate.length,
    updated: toUpdate.length,
    skipped: invalidRows.length,
    invalidRows,
  })
})
