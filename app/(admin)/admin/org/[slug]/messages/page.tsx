import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { adminAuth, adminDb } from '@/lib/firebase/admin'
import MessagesClient from './MessagesClient'

interface PageProps {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function MessagesPage({ params, searchParams }: PageProps) {
  const { slug } = await params
  const sp = await searchParams
  const initialConvId = typeof sp.convId === 'string' ? sp.convId : undefined

  // Auth — same pattern as WorkspaceLayout
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get(process.env.SESSION_COOKIE_NAME ?? '__session')?.value
  if (!sessionCookie) redirect('/login')

  let uid: string
  let displayName: string
  try {
    const decoded = await adminAuth.verifySessionCookie(sessionCookie, true)
    uid = decoded.uid
    displayName = decoded.name ?? decoded.email ?? uid
  } catch {
    redirect('/login')
  }

  // Resolve org by slug
  const orgSnap = await adminDb
    .collection('organizations')
    .where('slug', '==', slug)
    .get()
  if (orgSnap.empty) redirect('/admin/dashboard')

  const orgId = orgSnap.docs[0].id

  return (
    <MessagesClient
      orgId={orgId}
      uid={uid}
      displayName={displayName}
      initialConvId={initialConvId}
    />
  )
}
