'use client'
export const dynamic = 'force-dynamic'

import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import Link from 'next/link'
import Image from 'next/image'

const ALLOWED_FIREBASE_HOSTS = [
  'partners-in-biz-85059.firebaseapp.com',
  'partners-in-biz-85059.web.app',
]

function isSafeFirebaseLink(raw: string): boolean {
  try {
    const url = new URL(raw)
    return ALLOWED_FIREBASE_HOSTS.includes(url.hostname) && url.pathname === '/__/auth/action'
  } catch {
    return false
  }
}

function ResetContent() {
  const params = useSearchParams()
  const raw = params.get('link') ?? ''
  const safe = isSafeFirebaseLink(raw)

  return (
    <main className="relative min-h-screen flex items-center justify-center px-6 md:px-10 bg-[var(--color-pib-bg)] overflow-hidden">
      <div className="absolute inset-0 pib-mesh pointer-events-none" />
      <div className="absolute inset-0 pib-grid-bg pointer-events-none opacity-40" />

      <div className="relative w-full max-w-md">
        <Link
          href="/"
          className="inline-flex items-center gap-2.5 mb-8 text-[var(--color-pib-text-muted)] hover:text-[var(--color-pib-text)] transition-colors"
        >
          <Image src="/pib-logo-512.png" alt="Partners in Biz" width={28} height={28} className="rounded-md object-contain" />
          <span className="font-display text-lg leading-none">Partners in Biz</span>
        </Link>

        <div className="bento-card !p-8 md:!p-10">
          {safe ? (
            <>
              <p className="eyebrow">Password setup</p>
              <h1 className="font-display text-3xl md:text-4xl mt-2 mb-3">Set your password</h1>
              <p className="text-sm text-[var(--color-pib-text-muted)] mb-8">
                Click the button below to set your password and activate your account. You&rsquo;ll be taken to a secure page to complete setup.
              </p>
              <a
                href={raw}
                className="btn-pib-accent justify-center inline-flex w-full"
              >
                Set my password
                <span className="material-symbols-outlined text-base">arrow_forward</span>
              </a>
              <p className="text-xs text-[var(--color-pib-text-muted)] mt-6 text-center">
                Already set your password?{' '}
                <Link href="/login" className="text-[var(--color-pib-accent-hover)] hover:text-[var(--color-pib-accent)] transition-colors">
                  Sign in
                </Link>
              </p>
            </>
          ) : (
            <>
              <p className="eyebrow">Invalid link</p>
              <h1 className="font-display text-3xl md:text-4xl mt-2 mb-3">Link not valid</h1>
              <p className="text-sm text-[var(--color-pib-text-muted)] mb-8">
                This setup link is missing or invalid. Request a new password reset from the login page.
              </p>
              <Link href="/login" className="btn-pib-accent justify-center inline-flex w-full">
                Go to sign in
                <span className="material-symbols-outlined text-base">arrow_forward</span>
              </Link>
            </>
          )}
        </div>
      </div>
    </main>
  )
}

export default function ResetPage() {
  return (
    <Suspense>
      <ResetContent />
    </Suspense>
  )
}
