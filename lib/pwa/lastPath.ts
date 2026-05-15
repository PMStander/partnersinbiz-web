// Tracks the last authenticated route the user visited so we can return them
// there when the PWA is reopened (manifest start_url lands on `/`).

export const LAST_PATH_KEY = 'pib_last_path'

const VALID_PREFIXES = ['/portal', '/admin'] as const

export function isRestorablePath(path: string | null | undefined): path is string {
  if (!path) return false
  if (!path.startsWith('/')) return false
  // Reject protocol-relative (`//evil.com`) and anything with whitespace.
  if (path.startsWith('//')) return false
  if (/\s/.test(path)) return false
  return VALID_PREFIXES.some((p) => path === p || path.startsWith(p + '/') || path.startsWith(p + '?'))
}

export function saveLastPath(path: string) {
  if (typeof window === 'undefined') return
  if (!isRestorablePath(path)) return
  try {
    window.localStorage.setItem(LAST_PATH_KEY, path)
  } catch {
    // Storage might be unavailable (private mode quotas, etc.) — best-effort only.
  }
}

export function readLastPath(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const v = window.localStorage.getItem(LAST_PATH_KEY)
    return isRestorablePath(v) ? v : null
  } catch {
    return null
  }
}

export function clearLastPath() {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(LAST_PATH_KEY)
  } catch {
    // ignore
  }
}
