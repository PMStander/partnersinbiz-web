import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'PiB | Digital Excellence Engineered',
  description:
    'We engineer high-performance digital instruments for brands that demand absolute precision and technical superiority.',
}

export default function HomePage() {
  return (
    <>
      {/* Background Video Layer */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <video
          autoPlay
          loop
          muted
          playsInline
          className="absolute top-1/2 left-1/2 min-w-full min-h-full -translate-x-1/2 -translate-y-1/2 object-cover brightness-[0.7]"
        >
          <source
            src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260302_141646_a5156969-0608-4d43-9e34-90f4716d1f32.mp4"
            type="video/mp4"
          />
        </video>
        <div className="absolute inset-0 bg-black/40" />
      </div>

      {/* Main page content */}
      <main className="relative z-10 px-8 md:px-16">
        {/* Hero Section */}
        <section className="pt-[256px] pb-32 flex flex-col items-center text-center">
          <span className="uppercase text-xs tracking-[0.3em] text-white/60 font-medium mb-8">
            DIGITAL EXCELLENCE ENGINEERED
          </span>
          <h1 className="font-headline font-bold leading-[0.85] tracking-tighter uppercase text-huge text-white">
            PiB
          </h1>
          <p className="max-w-md mt-10 text-sm font-light text-white/70 leading-relaxed">
            We engineer high-performance digital instruments for brands that demand absolute
            precision and technical superiority.
          </p>
        </section>

        {/* Info Cards Grid */}
        <section className="py-24 grid grid-cols-1 md:grid-cols-2 gap-12">
          {/* Card 1 */}
          <div className="glass-card min-h-[220px] p-10 rounded-2xl flex flex-col justify-between group hover:border-white/30 transition-all">
            <span className="material-symbols-outlined text-3xl opacity-40">code_blocks</span>
            <div>
              <h3 className="text-4xl font-bold text-white mb-2">15+</h3>
              <p className="text-white/50 text-sm mb-4">Years of engineering</p>
              <div className="flex items-center gap-2 text-xs uppercase tracking-widest font-semibold text-white">
                <span
                  className="material-symbols-outlined text-sm"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  check_circle
                </span>
                Senior-level precision
              </div>
            </div>
          </div>

          {/* Card 2 */}
          <div className="flex flex-col justify-between py-6">
            <h2 className="text-3xl md:text-5xl font-headline font-bold leading-tight tracking-tight">
              Precision / <br /> development
            </h2>
            <div className="mt-8">
              <div className="text-white/40 font-mono text-sm mb-6">(0.3%) Post-launch issues</div>
              <Link
                className="inline-flex items-center gap-2 group text-white font-medium hover:gap-4 transition-all"
                href="/our-process"
              >
                See our process
                <span className="material-symbols-outlined">arrow_outward</span>
              </Link>
            </div>
          </div>
        </section>

        {/* Scalable Section */}
        <section className="py-32 grid grid-cols-1 lg:grid-cols-12 gap-16 items-end">
          <div className="lg:col-span-8">
            <h2 className="font-headline font-bold leading-[0.85] tracking-tighter uppercase text-mega">
              Simple / <br /> Smart / <br /> <span className="text-white">Scalable</span>
            </h2>
            <div className="mt-16 flex flex-wrap gap-8 items-center">
              <div className="glass-card p-8 rounded-2xl max-w-xs">
                <div className="text-5xl font-bold mb-2">340%</div>
                <p className="text-xs uppercase tracking-widest text-white/50">
                  Performance boost
                </p>
              </div>
              <Link href="/our-process">
                <button className="bg-white text-black px-10 py-5 rounded-md font-bold text-sm uppercase tracking-widest hover:scale-105 transition-transform">
                  Learn more
                </button>
              </Link>
            </div>
          </div>
          <div className="lg:col-span-4 relative">
            <div className="absolute -top-32 right-0 w-32 h-32 glass-card rounded-full flex items-center justify-center text-center p-4 border-dashed border-white/20">
              <span className="text-[10px] uppercase tracking-tighter font-bold leading-tight">
                AI&#8209;Native <br /> Engineering
              </span>
            </div>
            <ul className="space-y-8">
              <li className="text-white/30 text-2xl font-headline transition-colors hover:text-white">
                Strategy
              </li>
              <li className="text-white text-2xl font-headline flex items-center gap-4">
                <span
                  className="material-symbols-outlined"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  check_circle
                </span>
                Design
              </li>
              <li className="text-white/30 text-2xl font-headline transition-colors hover:text-white">
                Develop
              </li>
              <li className="text-white/30 text-2xl font-headline transition-colors hover:text-white">
                Scale
              </li>
            </ul>
          </div>
        </section>

        {/* The Process Grid */}
        <section className="py-32">
          <div className="mb-20">
            <span className="text-xs uppercase tracking-[0.3em] text-white/40">Our Process</span>
            <h2 className="text-4xl md:text-6xl font-headline font-bold mt-4">
              From idea / to impact
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Step 01 */}
            <div className="glass-card p-8 rounded-2xl border-t-2 border-t-white group hover:bg-white/[0.06] transition-all">
              <span className="text-sm font-mono text-white/30 mb-12 block">01</span>
              <h4 className="text-xl font-bold mb-4 uppercase tracking-tight">Discover</h4>
              <p className="text-sm text-white/50 leading-relaxed">
                Deep architectural analysis of your goals and user requirements.
              </p>
            </div>
            {/* Step 02 */}
            <div className="glass-card p-8 rounded-2xl border-t-2 border-t-white group hover:bg-white/[0.06] transition-all">
              <span className="text-sm font-mono text-white/30 mb-12 block">02</span>
              <h4 className="text-xl font-bold mb-4 uppercase tracking-tight">Design</h4>
              <p className="text-sm text-white/50 leading-relaxed">
                Crafting high-fidelity prototypes with absolute visual clarity.
              </p>
            </div>
            {/* Step 03 */}
            <div className="glass-card p-8 rounded-2xl border-t-2 border-t-white group hover:bg-white/[0.06] transition-all">
              <span className="text-sm font-mono text-white/30 mb-12 block">03</span>
              <h4 className="text-xl font-bold mb-4 uppercase tracking-tight">Develop</h4>
              <p className="text-sm text-white/50 leading-relaxed">
                Engineering scalable solutions with production-grade code.
              </p>
            </div>
            {/* Step 04 */}
            <div className="glass-card p-8 rounded-2xl border-t-2 border-t-white group hover:bg-white/[0.06] transition-all">
              <span className="text-sm font-mono text-white/30 mb-12 block">04</span>
              <h4 className="text-xl font-bold mb-4 uppercase tracking-tight">Deploy</h4>
              <p className="text-sm text-white/50 leading-relaxed">
                Launching and optimizing for peak performance at scale.
              </p>
            </div>
          </div>
        </section>

        {/* Stats Grid */}
        <section className="py-32 border-y border-white/10">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-12">
            <div className="space-y-2">
              <div className="text-5xl md:text-7xl font-bold tracking-tighter">3.8x</div>
              <p className="text-[10px] uppercase tracking-widest text-white/40">Average ROI</p>
            </div>
            <div className="space-y-2">
              <div className="text-5xl md:text-7xl font-bold tracking-tighter">42ms</div>
              <p className="text-[10px] uppercase tracking-widest text-white/40">Load Time</p>
            </div>
            <div className="space-y-2">
              <div className="text-5xl md:text-7xl font-bold tracking-tighter">15+</div>
              <p className="text-[10px] uppercase tracking-widest text-white/40">Years Experience</p>
            </div>
            <div className="space-y-2">
              <div className="text-5xl md:text-7xl font-bold tracking-tighter">98.7%</div>
              <p className="text-[10px] uppercase tracking-widest text-white/40">Satisfaction</p>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-48 text-center flex flex-col items-center">
          <span className="text-xs uppercase tracking-[0.4em] mb-12 text-white/60">
            Ready to level up?
          </span>
          <h2 className="font-headline font-bold leading-[0.85] tracking-tighter uppercase text-mega max-w-5xl">
            Let&apos;s build / <br /> the future
          </h2>
          <div className="mt-20 flex flex-wrap items-center justify-center gap-4">
            <Link href="/start-a-project" className="group flex items-center gap-6 bg-white text-black px-12 py-6 rounded-md font-bold text-lg uppercase tracking-widest hover:pr-16 transition-all">
              Get in touch
              <span className="material-symbols-outlined text-3xl group-hover:translate-x-2 transition-transform">
                arrow_outward
              </span>
            </Link>
            <Link href="/login" className="flex items-center gap-3 border border-white/30 text-white px-10 py-6 rounded-md font-bold text-lg uppercase tracking-widest hover:border-white hover:bg-white/5 transition-all">
              Client Login
            </Link>
          </div>
        </section>
      </main>
    </>
  )
}
