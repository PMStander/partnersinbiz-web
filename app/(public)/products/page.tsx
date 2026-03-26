import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Products | PiB',
  description: 'Productized software systems engineered, battle-tested, and deployed for real businesses.',
}

export default function ProductsPage() {
  return (
    <main className="relative min-h-screen">
      {/* Ambient Atmosphere */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-[20%] -left-[10%] w-[60%] h-[60%] bg-white/5 blur-[120px] rounded-full"></div>
        <div className="absolute top-[40%] -right-[5%] w-[40%] h-[40%] bg-white/5 blur-[100px] rounded-full"></div>
        <div className="absolute inset-0 monolithic-grid opacity-20"></div>
      </div>

      {/* Hero Section */}
      <section className="relative pt-48 pb-24 px-8 md:px-16">
        <div className="max-w-7xl w-full">
          <span className="font-label text-[0.6875rem] uppercase tracking-[0.3em] text-white/40 mb-6 block">OUR PRODUCTS</span>
          <h1 className="font-headline text-[clamp(3.5rem,10vw,8rem)] leading-[0.85] font-bold tracking-tighter mb-10">
            Software we build<br /><span className="text-white/40">and sell.</span>
          </h1>
          <p className="font-body text-lg md:text-xl text-white/60 max-w-2xl font-light leading-relaxed">
            Beyond client work — these are productized systems we&apos;ve engineered, battle-tested, and deploy for real clubs and businesses. Buy it. Brand it. Run it.
          </p>
        </div>
      </section>

      {/* Athleet Product Card */}
      <section className="relative py-16 px-8 md:px-16">
        <div className="max-w-7xl mx-auto">
          <div className="glass-card rounded-2xl overflow-hidden border border-white/[0.08]">
            <div className="grid grid-cols-1 md:grid-cols-2">
              {/* Left: Product Info */}
              <div className="p-12 md:p-16 flex flex-col justify-between border-r border-white/[0.08]">
                <div>
                  <div className="flex items-center gap-3 mb-8">
                    <span className="font-label text-[0.6875rem] uppercase tracking-[0.3em] text-white/40">Product</span>
                    <span className="w-px h-4 bg-white/20"></span>
                    <span className="font-label text-[0.6875rem] uppercase tracking-[0.3em] text-white/40">Live</span>
                  </div>
                  <h2 className="font-headline text-5xl md:text-6xl font-bold tracking-tighter mb-4">ATHLEET</h2>
                  <p className="font-headline text-xl text-white/60 mb-8 font-light">Club management for serious coaches.</p>
                  <p className="font-body text-base text-white/50 leading-relaxed mb-10">
                    Athleet is a complete digital management system for sports clubs, coaching academies, and athletic programs. Member management, session scheduling, performance tracking, and a public-facing club site — all in one. We build it. You brand it. Your athletes love it.
                  </p>

                  {/* Tags */}
                  <div className="flex flex-wrap gap-2 mb-12">
                    {['Sports Clubs', 'Coaching Academies', 'Wrestling', 'Athletics', 'Martial Arts'].map((tag) => (
                      <span key={tag} className="font-label text-[0.6875rem] uppercase tracking-widest text-white/50 border border-white/[0.12] rounded-full px-4 py-1.5">
                        {tag}
                      </span>
                    ))}
                  </div>

                  {/* CTAs */}
                  <div className="flex flex-col sm:flex-row gap-4">
                    <a
                      href="https://athleet.space"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-white text-black font-headline uppercase tracking-widest text-sm px-8 py-4 rounded-md hover:scale-105 transition-transform duration-300 text-center"
                    >
                      View Live Demo →
                    </a>
                    <Link
                      href="/start-a-project"
                      className="glass-card text-white font-headline uppercase tracking-widest text-sm px-8 py-4 rounded-md hover:bg-white/10 transition-colors duration-300 text-center"
                    >
                      Get This For Your Club
                    </Link>
                  </div>
                </div>
              </div>

              {/* Right: Stats */}
              <div className="p-12 md:p-16 flex flex-col justify-center bg-white/[0.01]">
                <div className="absolute inset-0 monolithic-grid opacity-10 pointer-events-none"></div>
                <div className="relative space-y-12">
                  <div>
                    <div className="font-headline text-5xl md:text-6xl font-bold tracking-tighter mb-2">500+</div>
                    <div className="font-label text-[0.6875rem] uppercase tracking-[0.3em] text-white/40">Athletes managed</div>
                    <div className="w-8 h-px bg-white/20 mt-4"></div>
                  </div>
                  <div>
                    <div className="font-headline text-5xl md:text-6xl font-bold tracking-tighter mb-2">98%</div>
                    <div className="font-label text-[0.6875rem] uppercase tracking-[0.3em] text-white/40">Retention rate</div>
                    <div className="w-8 h-px bg-white/20 mt-4"></div>
                  </div>
                  <div>
                    <div className="font-headline text-5xl md:text-6xl font-bold tracking-tighter mb-2">&lt; 4 weeks</div>
                    <div className="font-label text-[0.6875rem] uppercase tracking-[0.3em] text-white/40">Deployment time</div>
                    <div className="w-8 h-px bg-white/20 mt-4"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Coming Soon Section */}
      <section className="relative py-32 px-8 md:px-16">
        <div className="max-w-7xl mx-auto">
          <div className="glass-card rounded-2xl p-12 md:p-20 text-center">
            <span className="font-label text-[0.6875rem] uppercase tracking-[0.3em] text-white/40 mb-6 block">COMING SOON</span>
            <h2 className="font-headline text-4xl md:text-6xl font-bold tracking-tighter mb-8">
              More products<br />in the pipeline.
            </h2>
            <p className="font-body text-lg text-white/50 max-w-xl mx-auto mb-12 leading-relaxed">
              Athleet is the first. Every few months, a new vertical. Same proven core — rebranded, reskinned, and ready to deploy.
            </p>
            <Link
              href="/start-a-project"
              className="inline-block border border-white/20 text-white font-headline uppercase tracking-widest text-sm px-10 py-4 rounded-md hover:bg-white/[0.05] transition-colors duration-300"
            >
              Want early access? Get in touch →
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}
