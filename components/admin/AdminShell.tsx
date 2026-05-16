'use client'

import { useEffect, useState } from 'react'
import { AdminSidebar } from './AdminSidebar'
import { AdminTopbar } from './AdminTopbar'
import { AdminTopbarNav } from './AdminTopbarNav'
import { WelcomeFlashHandler } from '@/components/ui/WelcomeFlashHandler'

interface AdminShellProps {
  userEmail: string
  children: React.ReactNode
}

type LayoutMode = 'sidebar' | 'topbar'

export function AdminShell({ userEmail, children }: AdminShellProps) {
  const [open, setOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('sidebar')

  useEffect(() => {
    const storedCollapsed = localStorage.getItem('sidebar_collapsed')
    if (storedCollapsed === 'true') setCollapsed(true)
    const storedLayout = localStorage.getItem('admin_layout') as LayoutMode | null
    if (storedLayout === 'topbar' || storedLayout === 'sidebar') setLayoutMode(storedLayout)
  }, [])

  function toggleCollapsed() {
    setCollapsed((prev) => {
      localStorage.setItem('sidebar_collapsed', String(!prev))
      return !prev
    })
  }

  function toggleLayout() {
    setLayoutMode((prev) => {
      const next: LayoutMode = prev === 'sidebar' ? 'topbar' : 'sidebar'
      localStorage.setItem('admin_layout', next)
      return next
    })
  }

  if (layoutMode === 'topbar') {
    return (
      <div className="flex flex-col h-screen overflow-hidden bg-[var(--color-pib-bg)] text-[var(--color-pib-text)]">
        <WelcomeFlashHandler />
        <AdminTopbarNav userEmail={userEmail} onToggleLayout={toggleLayout} />
        <main className="flex-1 overflow-y-auto px-4 md:px-8 py-8">
          <div className="max-w-[1400px] mx-auto w-full">
            {children}
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--color-pib-bg)] text-[var(--color-pib-text)]">
      <WelcomeFlashHandler />
      <AdminSidebar open={open} onClose={() => setOpen(false)} collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
      <div className="flex flex-col flex-1 overflow-hidden min-w-0">
        <AdminTopbar userEmail={userEmail} onMenuClick={() => setOpen(true)} onToggleLayout={toggleLayout} />
        <main className="flex-1 overflow-y-auto px-4 md:px-8 py-8">
          <div className="max-w-[1400px] mx-auto w-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
