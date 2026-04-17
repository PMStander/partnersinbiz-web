// app/api/v1/analytics/ingest/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { checkIngestRateLimit } from '@/lib/analytics/ingest-rate-limit'
import { hashIp } from '@/lib/analytics/ip-hash'
import { detectDevice } from '@/lib/analytics/device'
import type { IngestBody, IngestEventInput, DeviceType } from '@/lib/analytics/types'

export const dynamic = 'force-dynamic'

const MAX_BATCH = 50

function getIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
}

function validateEvent(e: IngestEventInput): string | null {
  if (!e.event || typeof e.event !== 'string') return 'event is required'
  if (!e.distinctId || typeof e.distinctId !== 'string') return 'distinctId is required'
  if (!e.sessionId || typeof e.sessionId !== 'string') return 'sessionId is required'
  return null
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ingestKey = req.headers.get('x-pib-ingest-key')
  if (!ingestKey) {
    return NextResponse.json({ error: 'x-pib-ingest-key header required' }, { status: 401 })
  }

  let body: IngestBody
  try {
    body = (await req.json()) as IngestBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.propertyId) {
    return NextResponse.json({ error: 'propertyId is required' }, { status: 400 })
  }

  if (!Array.isArray(body.events)) {
    return NextResponse.json({ error: 'events must be an array' }, { status: 400 })
  }

  if (body.events.length > MAX_BATCH) {
    return NextResponse.json({ error: `Batch limit is ${MAX_BATCH} events` }, { status: 400 })
  }

  // Validate ingest key against property
  const propSnap = await adminDb.collection('properties').doc(body.propertyId).get().catch(() => null)
  if (!propSnap?.exists || propSnap.data()?.deleted) {
    return NextResponse.json({ error: 'Invalid ingest key' }, { status: 401 })
  }
  const property = propSnap.data()!
  if (property.ingestKey !== ingestKey) {
    return NextResponse.json({ error: 'Invalid ingest key' }, { status: 401 })
  }

  const allowed = await checkIngestRateLimit(ingestKey)
  if (!allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': '60' } },
    )
  }

  const ip = getIp(req)
  const ipHash = hashIp(ip)
  const serverTime = FieldValue.serverTimestamp()
  const orgId: string = property.orgId
  const propertyId: string = body.propertyId
  const country = req.headers.get('x-vercel-ip-country') ?? null

  const accepted: IngestEventInput[] = []
  const errors: string[] = []

  for (const e of body.events) {
    const err = validateEvent(e)
    if (err) { errors.push(err); continue }
    accepted.push(e)
  }

  if (accepted.length > 0) {
    const batch = adminDb.batch()

    for (const e of accepted) {
      const ref = adminDb.collection('product_events').doc()
      const device: DeviceType | null = detectDevice(e.userAgent ?? req.headers.get('user-agent'))
      batch.set(ref, {
        orgId,
        propertyId,
        sessionId: e.sessionId,
        distinctId: e.distinctId,
        userId: e.userId ?? null,
        event: e.event,
        properties: e.properties ?? {},
        pageUrl: e.pageUrl ?? null,
        referrer: e.referrer ?? null,
        userAgent: e.userAgent ?? null,
        ipHash,
        country,
        device,
        timestamp: e.timestamp ? Timestamp.fromDate(new Date(e.timestamp)) : serverTime,
        serverTime,
      })
    }

    await batch.commit()

    // Upsert sessions — one transaction per unique sessionId
    const sessionGroups = new Map<string, { first: IngestEventInput; count: number; pageCount: number }>()
    for (const e of accepted) {
      const g = sessionGroups.get(e.sessionId)
      if (!g) {
        sessionGroups.set(e.sessionId, { first: e, count: 1, pageCount: e.pageUrl ? 1 : 0 })
      } else {
        g.count++
        if (e.pageUrl) g.pageCount++
      }
    }

    for (const [sessionId, g] of sessionGroups.entries()) {
      const sessionRef = adminDb.collection('product_sessions').doc(sessionId)
      await adminDb.runTransaction(async (tx) => {
        const snap = await tx.get(sessionRef)
        if (snap.exists) {
          tx.update(sessionRef, {
            lastActivityAt: serverTime,
            eventCount: FieldValue.increment(g.count),
            pageCount: FieldValue.increment(g.pageCount),
            ...(g.first.userId && !snap.data()?.userId ? { userId: g.first.userId } : {}),
          })
        } else {
          const device: DeviceType | null = detectDevice(g.first.userAgent ?? null)
          tx.set(sessionRef, {
            orgId,
            propertyId,
            distinctId: g.first.distinctId,
            userId: g.first.userId ?? null,
            startedAt: serverTime,
            lastActivityAt: serverTime,
            endedAt: null,
            eventCount: g.count,
            pageCount: g.pageCount,
            referrer: g.first.referrer ?? null,
            landingUrl: g.first.pageUrl ?? null,
            country,
            device,
            utmSource: g.first.utm?.source ?? null,
            utmMedium: g.first.utm?.medium ?? null,
            utmCampaign: g.first.utm?.campaign ?? null,
            utmContent: g.first.utm?.content ?? null,
            convertedEvents: [],
          })
        }
      })
    }
  }

  return NextResponse.json({
    accepted: accepted.length,
    rejected: errors.length,
    errors,
  })
}
