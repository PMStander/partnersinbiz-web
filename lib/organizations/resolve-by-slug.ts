// lib/organizations/resolve-by-slug.ts
import { adminDb } from '@/lib/firebase/admin'

export async function resolveOrgIdBySlug(slug: string): Promise<string | null> {
  const snap = await adminDb
    .collection('organizations')
    .where('slug', '==', slug)
    .limit(1)
    .get()
  if (snap.docs.length === 0) return null
  return snap.docs[0].id
}
