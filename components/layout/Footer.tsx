import Link from 'next/link'

export default function Footer() {
  return (
    <footer className="relative z-10 bg-black w-full py-20 border-t border-white/[0.1] font-body text-sm tracking-wide">
      <div className="max-w-7xl mx-auto px-8 md:px-16 grid grid-cols-1 md:grid-cols-4 gap-12">
        <div className="col-span-1 md:col-span-2">
          <div className="text-2xl font-bold tracking-tighter text-white font-headline mb-6">PiB</div>
          <p className="text-white/40 max-w-xs mb-8">
            Partners in Biz. Engineering digital dominance for the next generation of industry leaders.
          </p>
          <div className="flex gap-6">
            <a href="#" className="text-white/40 hover:text-white transition-opacity">Twitter</a>
            <a href="#" className="text-white/40 hover:text-white transition-opacity">LinkedIn</a>
            <a href="#" className="text-white/40 hover:text-white transition-opacity">Instagram</a>
          </div>
        </div>
        <div>
          <h5 className="text-white font-bold mb-6">Company</h5>
          <ul className="space-y-4">
            <li><Link href="/our-process" className="text-white/40 hover:text-white transition-opacity">Services</Link></li>
            <li><Link href="/discover" className="text-white/40 hover:text-white transition-opacity">Work</Link></li>
            <li><Link href="/products" className="text-white/40 hover:text-white transition-opacity">Products</Link></li>
            <li><Link href="/about" className="text-white/40 hover:text-white transition-opacity">About</Link></li>
            <li><a href="#" className="text-white/40 hover:text-white transition-opacity">Careers</a></li>
          </ul>
        </div>
        <div>
          <h5 className="text-white font-bold mb-6">Support</h5>
          <ul className="space-y-4">
            <li><Link href="/start-a-project" className="text-white/40 hover:text-white transition-opacity">Contact</Link></li>
            <li><Link href="/privacy-policy" className="text-white/40 hover:text-white transition-opacity">Privacy Policy</Link></li>
            <li><Link href="/terms-of-service" className="text-white/40 hover:text-white transition-opacity">Terms of Service</Link></li>
          </ul>
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-8 md:px-16 mt-20 pt-8 border-t border-white/[0.05]">
        <p className="text-white/20 text-xs">© 2026 Partners in Biz. Digital Excellence Engineered.</p>
      </div>
    </footer>
  )
}
