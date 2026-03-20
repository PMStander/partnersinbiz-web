import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Create Account | PiB',
}

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
