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
    <div className="flex h-screen overflow-hidden bg-black">
      <AdminSidebar open={open} onClose={() => setOpen(false)} />
      <div className="flex flex-col flex-1 overflow-hidden min-w-0">
        <AdminTopbar userEmail={userEmail} onMenuClick={() => setOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
