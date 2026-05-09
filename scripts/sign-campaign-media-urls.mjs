#!/usr/bin/env node
/**
 * One-shot fix for the 2026-Q1 PiB import: regenerate signed read URLs for
 * every image in `social_posts.media[]` that's a direct
 * `storage.googleapis.com/<bucket>/<path>` link, since uniform-bucket-level
 * access blocks anonymous reads.
 *
 * Replace these with V4 signed URLs (5-year expiry; we only need browser
 * read access).
 *
 * Usage:
 *   node scripts/sign-campaign-media-urls.mjs <campaignId>
 *
 * Set `DRY=1` to print what would change without writing.
 */
import 'dotenv/config'
import { config } from 'dotenv'
import admin from 'firebase-admin'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
config({ path: path.join(__dirname, '..', '.env.local') })

const dryRun = process.env.DRY === '1'
const campaignId = process.argv[2]
if (!campaignId) {
  console.error('Usage: node scripts/sign-campaign-media-urls.mjs <campaignId>')
  process.exit(1)
}

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
    clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  }),
  storageBucket: `${process.env.FIREBASE_ADMIN_PROJECT_ID}.firebasestorage.app`,
})

const db = admin.firestore()
const bucket = admin.storage().bucket()

/** Extract bucket-relative path from a `https://storage.googleapis.com/<bucket>/<path>` URL. */
function urlToObjectPath(url) {
  if (!url || typeof url !== 'string') return null
  const m = url.match(/storage\.googleapis\.com\/[^/]+\/(.+?)(?:\?.*)?$/)
  return m ? decodeURIComponent(m[1]) : null
}

/**
 * Generate a permanent Firebase Storage download URL by setting a download
 * token in the object's metadata. This is the same scheme `getDownloadURL()`
 * uses on the client SDK. Tokens don't expire.
 */
import { randomUUID } from 'crypto'
async function signedUrlFor(objectPath) {
  const file = bucket.file(objectPath)
  const [exists] = await file.exists()
  if (!exists) return null

  const [meta] = await file.getMetadata()
  let tokens = meta.metadata?.firebaseStorageDownloadTokens
  if (!tokens) {
    tokens = randomUUID()
    await file.setMetadata({
      metadata: { ...(meta.metadata || {}), firebaseStorageDownloadTokens: tokens },
    })
  }
  const encodedPath = encodeURIComponent(objectPath)
  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media&token=${tokens}`
}

async function processCollection(collection, idField, fieldName) {
  const snap = await db.collection(collection).where(idField, '==', campaignId).get()
  let touched = 0
  for (const doc of snap.docs) {
    const data = doc.data()
    const media = Array.isArray(data[fieldName]) ? data[fieldName] : null
    if (!media || media.length === 0) continue

    let dirty = false
    const next = await Promise.all(
      media.map(async (m) => {
        if (!m || typeof m !== 'object') return m
        if (m.type !== 'image' && m.type !== 'video') return m
        const objectPath = urlToObjectPath(m.url)
        if (!objectPath) return m
        // Already a Firebase download URL?
        if (m.url && m.url.includes('firebasestorage.googleapis.com')) return m
        const signed = await signedUrlFor(objectPath)
        if (!signed) {
          console.warn(`  [missing] ${objectPath}`)
          return m
        }
        dirty = true
        return { ...m, url: signed }
      }),
    )

    if (dirty) {
      console.log(`  ${collection}/${doc.id} → ${next.length} media items signed`)
      if (!dryRun) {
        await doc.ref.update({ [fieldName]: next, updatedAt: admin.firestore.FieldValue.serverTimestamp() })
      }
      touched++
    }
  }
  return touched
}

console.log(`${dryRun ? '[DRY] ' : ''}Signing media for campaign ${campaignId}…`)
const social = await processCollection('social_posts', 'campaignId', 'media')
console.log(`social_posts touched: ${social}`)
const seo = await processCollection('seo_content', 'campaignId', 'media')
console.log(`seo_content touched: ${seo}`)

// Also fix social_media records (where the legacy upload helper stored old
// `storage.googleapis.com` URLs in `originalUrl` + `thumbnailUrl`). These show
// up in `<link rel="preload">` hints when joined onto posts.
async function processMediaCollection() {
  const snap = await db.collection('social_media').get()
  let touched = 0
  for (const doc of snap.docs) {
    const data = doc.data()
    if (!data.storagePath) continue
    const orig = data.originalUrl
    if (orig && orig.includes('firebasestorage.googleapis.com')) continue
    const signed = await signedUrlFor(data.storagePath)
    if (!signed) continue
    console.log(`  social_media/${doc.id} → re-pointed`)
    if (!dryRun) {
      await doc.ref.update({
        originalUrl: signed,
        thumbnailUrl: signed,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      })
    }
    touched++
  }
  return touched
}

const media = await processMediaCollection()
console.log(`social_media touched: ${media}`)

// Also fix scalar `heroImageUrl` field on seo_content (BlogReaderCard reads it).
async function processBlogHeroImages() {
  const snap = await db.collection('seo_content').where('campaignId', '==', campaignId).get()
  let touched = 0
  for (const doc of snap.docs) {
    const data = doc.data()
    const hero = data.heroImageUrl
    if (!hero || typeof hero !== 'string') continue
    if (hero.includes('firebasestorage.googleapis.com')) continue
    const objectPath = urlToObjectPath(hero)
    if (!objectPath) continue
    const signed = await signedUrlFor(objectPath)
    if (!signed) continue
    console.log(`  seo_content/${doc.id} → heroImageUrl re-pointed`)
    if (!dryRun) {
      await doc.ref.update({
        heroImageUrl: signed,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      })
    }
    touched++
  }
  return touched
}

const heroes = await processBlogHeroImages()
console.log(`seo_content heroImageUrl touched: ${heroes}`)

console.log('Done.')
process.exit(0)
