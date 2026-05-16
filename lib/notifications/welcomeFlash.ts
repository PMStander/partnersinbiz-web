const KEY = 'pib_welcome_flash'

export type WelcomeFlash = {
  name: string
  email?: string
}

export function setWelcomeFlash(flash: WelcomeFlash): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(KEY, JSON.stringify(flash))
  } catch {}
}

export function consumeWelcomeFlash(): WelcomeFlash | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    sessionStorage.removeItem(KEY)
    const parsed = JSON.parse(raw) as WelcomeFlash
    if (!parsed?.name) return null
    return parsed
  } catch {
    return null
  }
}
