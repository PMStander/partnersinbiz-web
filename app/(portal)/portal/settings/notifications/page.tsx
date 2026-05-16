// app/(portal)/portal/settings/notifications/page.tsx
'use client'
export const dynamic = 'force-dynamic'

import { PushNotificationsToggle } from '@/components/pwa/PushNotificationsToggle'

export default function NotificationsPage() {
  return (
    <div className="max-w-xl">
      <h1 className="text-lg font-semibold mb-1">Notifications</h1>
      <p className="text-sm text-[var(--color-pib-text-muted)] mb-8">Control how Partners in Biz notifies you.</p>

      <div className="bg-[var(--color-pib-surface)] border border-[var(--color-pib-line)] rounded-xl p-5">
        <p className="text-sm font-medium mb-3">Push notifications</p>
        <PushNotificationsToggle />
      </div>
    </div>
  )
}
