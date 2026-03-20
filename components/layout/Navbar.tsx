'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const links = [
  { href: '/', label: 'Home' },
  { href: '/our-process', label: 'Services' },
  { href: '/discover', label: 'Work' },
  { href: '/about', label: 'About' },
  { href: '/start-a-project', label: 'Contact' },
]

export default function Navbar() {
  const pathname = usePathname()
  return (
    <nav className="fixed top-0 w-full border-b border-white/[0.15] bg-black/20 backdrop-blur-2xl flex justify-between items-center px-8 md:px-16 h-20 z-50 font-headline font-medium tracking-tight">
      <Link href="/" className="text-2xl font-bold tracking-tighter text-white">PiB</Link>
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
      <Link
        href="/start-a-project"
        className="rounded-full bg-white/[0.08] hover:bg-white/[0.15] px-6 py-2 text-sm font-medium transition-all active:scale-95 text-white"
      >
        Start a Project
      </Link>
    </nav>
  )
}
