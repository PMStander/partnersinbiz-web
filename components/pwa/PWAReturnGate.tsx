'use client'

import { useEffect } from 'react'
import { usePathname, useSearchParams, useRouter } from 'next/navigation'
import { readLastPath, isRestorablePath } from '@/lib/pwa/lastPath'

const PWA_SOURCES = new Set(['pwa', 'pwa-shortcut'])

/**
 * When the installed PWA is reopened, the manifest start_url drops the user on
 * `/?source=pwa`. If they were previously inside the portal/admin app, send
 * them straight back to where they left off (server middleware will still
 * gate it behind auth).
 */
export function PWAReturnGate() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (pathname !== '/') return

    const source = searchParams?.get('source')
    if (!source || !PWA_SOURCES.has(source)) return

    const target = readLastPath()
    if (!isRestorablePath(target)) return
    if (target === '/' || target === pathname) return

    router.replace(target)
  }, [pathname, searchParams, router])

  return null
}
