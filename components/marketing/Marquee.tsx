import { ReactNode } from 'react'

interface Props {
  children: ReactNode
  className?: string
  pauseOnHover?: boolean
}

export function Marquee({ children, className = '' }: Props) {
  return (
    <div className={`relative overflow-hidden ${className}`} aria-hidden="true">
      <div className="flex gap-12 pib-marquee" style={{ width: 'max-content' }}>
        <div className="flex gap-12 items-center pr-12">{children}</div>
        <div className="flex gap-12 items-center pr-12">{children}</div>
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[var(--color-pib-bg)] to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-[var(--color-pib-bg)] to-transparent" />
    </div>
  )
}
