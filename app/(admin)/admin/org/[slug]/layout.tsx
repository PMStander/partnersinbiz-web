import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { adminAuth, adminDb } from '@/lib/firebase/admin'

interface WorkspaceLayoutProps {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}

export default async function WorkspaceLayout({ children, params }: WorkspaceLayoutProps) {
  const { slug } = await params
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get(process.env.SESSION_COOKIE_NAME ?? '__session')?.value

  if (!sessionCookie) redirect('/login')

  let uid: string
  try {
    const decoded = await adminAuth.verifySessionCookie(sessionCookie, true)
    uid = decoded.uid
  } catch {
    redirect('/login')
  }

  const userDoc = await adminDb.collection('users').doc(uid).get()
  const role = userDoc.exists ? userDoc.data()?.role : 'client'

  // Find the org by slug
  const orgSnap = await adminDb.collection('organizations').where('slug', '==', slug).get()
  if (orgSnap.empty) redirect('/admin/dashboard')

  const org = { id: orgSnap.docs[0].id, ...orgSnap.docs[0].data() }

  // Check access: admins can see all, clients must be a member
  if (role !== 'admin') {
    const members = (org as any).members ?? []
    const isMember = members.some((m: any) => m.userId === uid)
    if (!isMember) redirect('/admin/dashboard')
  }

  return <>{children}</>
}
