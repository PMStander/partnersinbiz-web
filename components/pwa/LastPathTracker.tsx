'use client'

import { useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { saveLastPath } from '@/lib/pwa/lastPath'

export function LastPathTracker() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (!pathname) return
    const qs = searchParams?.toString()
    saveLastPath(qs ? `${pathname}?${qs}` : pathname)
  }, [pathname, searchParams])

  return null
}
