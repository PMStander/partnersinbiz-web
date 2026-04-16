import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { adminAuth, adminDb } from '@/lib/firebase/admin'
import { AdminShell } from '@/components/admin/AdminShell'
import { OrgProvider } from '@/lib/contexts/OrgContext'
import { ToastProvider } from '@/components/ui/Toast'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const cookieStore = await cookies()
  const cookieName = process.env.SESSION_COOKIE_NAME ?? '__session'
  const sessionCookie = cookieStore.get(cookieName)?.value

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
  const email = userDoc.exists ? userDoc.data()?.email : ''

  if (role !== 'admin') redirect('/portal/dashboard')

  return (
    <ToastProvider>
      <OrgProvider>
        <AdminShell userEmail={email}>{children}</AdminShell>
      </OrgProvider>
    </ToastProvider>
  )
}
