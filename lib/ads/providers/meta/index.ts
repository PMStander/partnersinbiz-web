// lib/ads/providers/meta/index.ts
import type { AdProvider } from '@/lib/ads/provider'
import { makeStubProvider } from '@/lib/ads/provider'
// Note: This is TEMPORARILY a stub. Task 9 replaces this file's content with
// the real Meta provider once `./oauth.ts` and `./client.ts` exist.
export const metaProvider: AdProvider = makeStubProvider('meta')
