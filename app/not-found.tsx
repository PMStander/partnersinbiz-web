import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '404 — Page Not Found | PiB',
}

export default function NotFound() {
  return (
    <main className="relative z-10 min-h-screen flex flex-col items-center justify-center px-8 text-center">
      <span className="font-headline text-[clamp(6rem,20vw,14rem)] font-bold tracking-tighter leading-none text-white/10 select-none">
        404
      </span>
      <h1 className="font-headline text-3xl md:text-5xl font-bold tracking-tighter -mt-4 mb-6">
        Page not found.
      </h1>
      <p className="text-white/40 text-lg mb-12 max-w-md">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <Link
        href="/"
        className="bg-white text-black px-10 py-4 rounded-md font-headline font-bold uppercase tracking-widest text-sm hover:bg-white/90 transition-all"
      >
        Back to Home
      </Link>
    </main>
  )
}
