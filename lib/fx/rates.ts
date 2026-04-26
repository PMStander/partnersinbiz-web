// lib/fx/rates.ts
//
// Daily-cached FX rates. Source of truth is exchangerate.host (free, no key
// required) with frankfurter.app as fallback. Rates are cached in Firestore
// at `fx_rates/{date}` so we only ever fetch each day once and historical
// rates remain immutable for compliance/audit purposes.
//
// Public API:
//   getRate(currency, date) → number  (rate to ZAR for that date)
//   convertToZar({amount, currency, date}) → number
//   convert({amount, from, to, date}) → number

import { adminDb } from '@/lib/firebase/admin'
import { FieldValue } from 'firebase-admin/firestore'
import type { MetricCurrency } from '@/lib/metrics/types'

const FX_COLLECTION = 'fx_rates'
const BASE: MetricCurrency = 'ZAR'

interface FxDoc {
  date: string
  base: 'ZAR'
  /** rate[X] = how many X you get per 1 ZAR. To convert X → ZAR, divide. */
  rates: Partial<Record<MetricCurrency, number>>
  source: 'exchangerate.host' | 'frankfurter' | 'manual'
  fetchedAt: unknown
}

const memoryCache = new Map<string, FxDoc>()

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Most-recent ISO date ≤ requested (FX doesn't quote weekends in some sources). */
function clampDate(date: string): string {
  if (date > todayStr()) return todayStr()
  return date
}

async function loadFromFirestore(date: string): Promise<FxDoc | null> {
  if (memoryCache.has(date)) return memoryCache.get(date) ?? null
  const snap = await adminDb.collection(FX_COLLECTION).doc(date).get()
  if (!snap.exists) return null
  const doc = snap.data() as FxDoc
  memoryCache.set(date, doc)
  return doc
}

async function fetchFromExchangerateHost(date: string): Promise<FxDoc | null> {
  try {
    const url = `https://api.exchangerate.host/${date}?base=ZAR`
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const data = (await res.json()) as { rates?: Record<string, number> }
    if (!data.rates) return null
    return {
      date,
      base: 'ZAR',
      rates: data.rates as FxDoc['rates'],
      source: 'exchangerate.host',
      fetchedAt: FieldValue.serverTimestamp(),
    }
  } catch {
    return null
  }
}

async function fetchFromFrankfurter(date: string): Promise<FxDoc | null> {
  try {
    const url = `https://api.frankfurter.app/${date}?from=ZAR`
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const data = (await res.json()) as { rates?: Record<string, number> }
    if (!data.rates) return null
    return {
      date,
      base: 'ZAR',
      rates: data.rates as FxDoc['rates'],
      source: 'frankfurter',
      fetchedAt: FieldValue.serverTimestamp(),
    }
  } catch {
    return null
  }
}

async function persistDoc(doc: FxDoc): Promise<void> {
  memoryCache.set(doc.date, doc)
  await adminDb.collection(FX_COLLECTION).doc(doc.date).set(doc, { merge: true })
}

/**
 * Resolve the FX doc for a date. If absent:
 *   1. fetch from exchangerate.host
 *   2. fall back to frankfurter
 *   3. fall back to the most recent existing date
 *   4. last resort: 1.0 for ZAR, 0 for everything (caller should sanity-check)
 */
export async function getFxDoc(date: string): Promise<FxDoc> {
  const d = clampDate(date)
  const cached = await loadFromFirestore(d)
  if (cached) return cached

  const fetched = (await fetchFromExchangerateHost(d)) ?? (await fetchFromFrankfurter(d))
  if (fetched) {
    await persistDoc(fetched)
    return fetched
  }

  // Walk backwards 14 days for the most recent doc we have.
  for (let i = 1; i <= 14; i += 1) {
    const fallback = new Date(d)
    fallback.setUTCDate(fallback.getUTCDate() - i)
    const key = fallback.toISOString().slice(0, 10)
    const doc = await loadFromFirestore(key)
    if (doc) return doc
  }

  return {
    date: d,
    base: 'ZAR',
    rates: { ZAR: 1 },
    source: 'manual',
    fetchedAt: FieldValue.serverTimestamp(),
  }
}

/** Rate to convert 1 unit of `currency` to `BASE` (ZAR). */
export async function getRate(
  currency: MetricCurrency,
  date: string,
): Promise<number> {
  if (currency === BASE) return 1
  const doc = await getFxDoc(date)
  const rate = doc.rates[currency]
  if (!rate || rate === 0) return 0
  // doc.rates[X] = X per 1 ZAR. To go X → ZAR: divide amount by rate.
  return 1 / rate
}

export async function convertToZar(input: {
  amount: number
  currency: MetricCurrency
  date: string
}): Promise<number> {
  if (input.currency === BASE) return input.amount
  const rate = await getRate(input.currency, input.date)
  if (rate === 0) return 0
  return input.amount * rate
}

export async function convert(input: {
  amount: number
  from: MetricCurrency
  to: MetricCurrency
  date: string
}): Promise<number> {
  if (input.from === input.to) return input.amount
  const inZar = await convertToZar({
    amount: input.amount,
    currency: input.from,
    date: input.date,
  })
  if (input.to === BASE) return inZar
  const targetRate = await getRate(input.to, input.date)
  if (targetRate === 0) return 0
  return inZar / targetRate
}

/** Test-only: clear in-process cache. Not exported for app code. */
export function _clearMemoryCacheForTests(): void {
  memoryCache.clear()
}
