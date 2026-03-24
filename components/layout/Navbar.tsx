'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'

const links = [
  { href: '/', label: 'Home' },
  { href: '/our-process', label: 'Services' },
  { href: '/discover', label: 'Work' },
  { href: '/products', label: 'Products' },
  { href: '/about', label: 'About' },
  { href: '/start-a-project', label: 'Contact' },
]

export default function Navbar() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  // Close sidebar on route change
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  // Prevent body scroll when sidebar is open
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  return (
    <>
      <nav className="fixed top-0 w-full border-b border-white/[0.15] bg-black/20 backdrop-blur-2xl flex justify-between items-center px-8 md:px-16 h-20 z-50 font-headline font-medium tracking-tight">
        <Link href="/" className="text-2xl font-bold tracking-tighter text-white">PiB</Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-12">
          {links.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`transition-colors duration-300 ${
                pathname === href
                  ? 'text-white border-b border-white pb-1'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              {label}
            </Link>
          ))}
        </div>

        {/* Right side: CTA + burger */}
        <div className="flex items-center gap-3">
          <Link
            href="/start-a-project"
            className="rounded-full bg-white/[0.08] hover:bg-white/[0.15] px-6 py-2 text-sm font-medium transition-all active:scale-95 text-white"
          >
            Start a Project
          </Link>

          {/* Burger — mobile only */}
          <button
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            className="md:hidden flex flex-col justify-center items-center w-10 h-10 gap-[5px] rounded-full hover:bg-white/[0.08] transition-colors"
          >
            <span className={`block w-5 h-[1.5px] bg-white transition-all duration-300 origin-center ${open ? 'rotate-45 translate-y-[6.5px]' : ''}`} />
            <span className={`block w-5 h-[1.5px] bg-white transition-all duration-300 ${open ? 'opacity-0 scale-x-0' : ''}`} />
            <span className={`block w-5 h-[1.5px] bg-white transition-all duration-300 origin-center ${open ? '-rotate-45 -translate-y-[6.5px]' : ''}`} />
          </button>
        </div>
      </nav>

      {/* Backdrop */}
      <div
        onClick={() => setOpen(false)}
        className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300 md:hidden ${
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* Sidebar */}
      <aside
        className={`fixed top-0 right-0 h-full w-72 z-50 bg-black border-l border-white/[0.1] flex flex-col pt-24 pb-12 px-8 transition-transform duration-300 ease-in-out md:hidden ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <nav className="flex flex-col gap-1 flex-1">
          {links.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`font-headline text-2xl font-bold tracking-tight py-3 border-b border-white/[0.06] transition-colors duration-200 ${
                pathname === href ? 'text-white' : 'text-white/40 hover:text-white'
              }`}
            >
              {label}
            </Link>
          ))}
        </nav>

        <p className="font-body text-xs text-white/20 tracking-wide">
          © 2026 Partners in Biz
        </p>
      </aside>
    </>
  )
}
