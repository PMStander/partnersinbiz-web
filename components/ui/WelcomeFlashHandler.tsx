'use client'

import { useEffect } from 'react'
import { useToast } from './Toast'
import { consumeWelcomeFlash } from '@/lib/notifications/welcomeFlash'

export function WelcomeFlashHandler() {
  const { success } = useToast()

  useEffect(() => {
    const flash = consumeWelcomeFlash()
    if (flash) success(`Yeah! Welcome back ${flash.name} 👋`)
  }, [success])

  return null
}
