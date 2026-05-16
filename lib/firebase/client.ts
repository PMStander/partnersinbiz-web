// lib/firebase/client.ts
//
// Convenience re-export for the client-side Firebase singletons used by
// document edit-share components. Keeps `import { auth, googleProvider } from
// '@/lib/firebase/client'` working everywhere even though the underlying
// definitions live in `./config.ts`.

export { auth, db, googleProvider, getClientAuth, getClientDb } from './config'
