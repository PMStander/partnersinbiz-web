'use client'

import { useState } from 'react'
import { AdminSidebar } from './AdminSidebar'
import { AdminTopbar } from './AdminTopbar'

interface AdminShellProps {
  userEmail: string
  children: React.ReactNode
}

export function AdminShell({ userEmail, children }: AdminShellProps) {
  const [open, setOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--color-pib-bg)] text-[var(--color-pib-text)]">
      <AdminSidebar open={open} onClose={() => setOpen(false)} />
      <div className="flex flex-col flex-1 overflow-hidden min-w-0">
        <AdminTopbar userEmail={userEmail} onMenuClick={() => setOpen(true)} />
        <main className="flex-1 overflow-y-auto px-4 md:px-8 py-8">
          <div className="max-w-[1400px] mx-auto w-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
