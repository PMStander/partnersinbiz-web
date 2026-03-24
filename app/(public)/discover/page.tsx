import type { Metadata } from 'next'
import Link from 'next/link'
// Note: keeping existing discover page content and adding Athleet as featured product

export const metadata: Metadata = {
  title: 'Discover Phase | PiB',
  description: 'The Discover Phase — where we deeply understand your business before writing a single line of code.',
}

export default function DiscoverPage() {
  return (
    <main className="relative min-h-screen">
      {/* Ambient Atmosphere */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-[20%] -left-[10%] w-[60%] h-[60%] bg-white/5 blur-[120px] rounded-full"></div>
        <div className="absolute top-[40%] -right-[5%] w-[40%] h-[40%] bg-white/5 blur-[100px] rounded-full"></div>
        <div className="absolute inset-0 monolithic-grid opacity-20"></div>
      </div>

      {/* Hero Section */}
      <section className="relative pt-64 pb-32 px-8 md:px-16 flex flex-col items-start min-h-[819px]">
        <div className="max-w-7xl w-full">
          <span className="font-label text-[0.6875rem] uppercase tracking-[0.3em] text-white/40 mb-6 block">Phase 01 / Architecture</span>
          <h1 className="font-headline text-[clamp(4rem,12vw,10rem)] leading-[0.85] font-bold tracking-tighter mb-12">
            DISCOVER
          </h1>
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-end">
            <p className="md:col-start-7 md:col-span-6 font-headline text-2xl md:text-4xl font-light text-white leading-tight">
              Deep architectural analysis of your goals and user requirements.
            </p>
          </div>
        </div>
      </section>

      {/* Featured Product: Athleet */}
      <section className="relative py-16 px-8 md:px-16">
        <div className="max-w-7xl mx-auto">
          <div className="mb-12">
            <span className="font-label text-[0.6875rem] uppercase tracking-[0.3em] text-white/40 mb-4 block">Featured</span>
            <h2 className="font-headline text-3xl font-bold tracking-tight uppercase">Our Work &amp; Products</h2>
          </div>
          <div className="glass-card rounded-2xl overflow-hidden border border-white/[0.08]">
            <div className="grid grid-cols-1 md:grid-cols-3">
              <div className="md:col-span-2 p-10 md:p-14 border-r border-white/[0.08]">
                <div className="flex items-center gap-3 mb-6">
                  <span className="font-label text-[0.6875rem] uppercase tracking-[0.3em] bg-white text-black px-3 py-1 rounded-sm">PRODUCT</span>
                </div>
                <h3 className="font-headline text-3xl md:text-4xl font-bold tracking-tighter mb-3">Athleet</h3>
                <p className="font-headline text-lg text-white/50 mb-6 font-light">Sports Club Management</p>
                <p className="font-body text-base text-white/50 leading-relaxed mb-10 max-w-lg">
                  Full-stack club management system. Built once, deployed for many.
                </p>
                <a
                  href="https://athleet-management.vercel.app"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block bg-white text-black font-headline uppercase tracking-widest text-sm px-8 py-4 rounded-md hover:scale-105 transition-transform duration-300"
                >
                  View Live Demo →
                </a>
              </div>
              <div className="p-10 md:p-14 flex flex-col justify-center bg-white/[0.01]">
                <div className="space-y-8">
                  <div>
                    <div className="font-headline text-4xl font-bold tracking-tighter mb-1">500+</div>
                    <div className="font-label text-[0.6875rem] uppercase tracking-[0.3em] text-white/40">Athletes managed</div>
                  </div>
                  <div className="w-8 h-px bg-white/10"></div>
                  <div>
                    <div className="font-headline text-4xl font-bold tracking-tighter mb-1">&lt; 4 wks</div>
                    <div className="font-label text-[0.6875rem] uppercase tracking-[0.3em] text-white/40">Deployment time</div>
                  </div>
                  <div className="w-8 h-px bg-white/10"></div>
                  <Link href="/products" className="font-label text-[0.6875rem] uppercase tracking-[0.3em] text-white/40 hover:text-white transition-colors">
                    All Products →
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Foundation Section */}
      <section className="relative py-32 px-8 md:px-16">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-12 gap-24">
          <div className="md:col-span-5">
            <h2 className="font-headline text-4xl md:text-5xl font-bold tracking-tight mb-8">The Foundation of Performance</h2>
            <div className="w-12 h-px bg-white/30 mb-8"></div>
          </div>
          <div className="md:col-span-7 flex flex-col gap-8">
            <p className="text-lg md:text-xl text-white/70 leading-relaxed font-light">
              Great instruments are not built by chance; they are engineered through rigorous observation. The Discovery phase at PiB is a deep-dive into the technical and psychological landscape of your project. We don&apos;t just ask what you want to build—we analyze why it must exist.
            </p>
            <p className="text-lg md:text-xl text-white/70 leading-relaxed font-light">
              By stripping away the superficial, we reveal the core logic of your brand. This phase eliminates technical debt before a single line of code is written, ensuring that the final monolith stands on a bedrock of absolute clarity and high-performance engineering.
            </p>
          </div>
        </div>
      </section>

      {/* Strategic Mapping (Bento Glass Grid) */}
      <section className="relative py-32 px-8 md:px-16">
        <div className="max-w-7xl mx-auto">
          <div className="mb-20">
            <h2 className="font-headline text-3xl font-bold tracking-tight uppercase mb-4">Strategic Mapping</h2>
            <p className="font-label text-[0.6875rem] uppercase tracking-widest text-white/40">Defining the blueprint of interaction</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Card 1 */}
            <div className="glass-card rounded-2xl p-10 flex flex-col justify-between min-h-[400px]">
              <div>
                <span className="material-symbols-outlined text-4xl mb-8">search</span>
                <h3 className="font-headline text-2xl font-bold mb-4">User Research</h3>
                <p className="text-white/50 leading-relaxed">Behavioral analysis and persona mapping to understand the precision required by your end-users.</p>
              </div>
              <div className="font-label text-[0.6875rem] text-white/30 tracking-widest">01 / EMPATHY</div>
            </div>
            {/* Card 2 */}
            <div className="glass-card rounded-2xl p-10 flex flex-col justify-between min-h-[400px]">
              <div>
                <span className="material-symbols-outlined text-4xl mb-8">terminal</span>
                <h3 className="font-headline text-2xl font-bold mb-4">Technical Audit</h3>
                <p className="text-white/50 leading-relaxed">Evaluating existing stack performance and determining the structural constraints of the monolith.</p>
              </div>
              <div className="font-label text-[0.6875rem] text-white/30 tracking-widest">02 / LOGIC</div>
            </div>
            {/* Card 3 */}
            <div className="glass-card rounded-2xl p-10 flex flex-col justify-between min-h-[400px]">
              <div>
                <span className="material-symbols-outlined text-4xl mb-8">clarify</span>
                <h3 className="font-headline text-2xl font-bold mb-4">Scope Definition</h3>
                <p className="text-white/50 leading-relaxed">Defining the boundaries of the glasshouse. Absolute precision in feature set and performance goals.</p>
              </div>
              <div className="font-label text-[0.6875rem] text-white/30 tracking-widest">03 / BOUNDARIES</div>
            </div>
          </div>
        </div>
      </section>

      {/* Visual Architecture */}
      <section className="relative py-32 px-8 md:px-16">
        <div className="max-w-7xl mx-auto glass-card rounded-2xl overflow-hidden border-white/5">
          <div className="grid grid-cols-1 md:grid-cols-2">
            <div className="p-12 md:p-20 border-r border-white/10">
              <h2 className="font-headline text-4xl md:text-5xl font-bold mb-12 leading-tight">Visual<br/>Architecture</h2>
              <ul className="space-y-10">
                <li className="flex items-start gap-6 group">
                  <span className="material-symbols-outlined text-2xl text-white/40 group-hover:text-white transition-colors">schema</span>
                  <div>
                    <h4 className="font-headline text-lg font-bold mb-2">Data Structures</h4>
                    <p className="text-sm text-white/40">Optimized informational hierarchy for rapid access.</p>
                  </div>
                </li>
                <li className="flex items-start gap-6 group">
                  <span className="material-symbols-outlined text-2xl text-white/40 group-hover:text-white transition-colors">architecture</span>
                  <div>
                    <h4 className="font-headline text-lg font-bold mb-2">System Blueprint</h4>
                    <p className="text-sm text-white/40">Architectural diagrams representing low-latency logic.</p>
                  </div>
                </li>
                <li className="flex items-start gap-6 group">
                  <span className="material-symbols-outlined text-2xl text-white/40 group-hover:text-white transition-colors">account_tree</span>
                  <div>
                    <h4 className="font-headline text-lg font-bold mb-2">Node Mapping</h4>
                    <p className="text-sm text-white/40">Mapping interactive touchpoints across the journey.</p>
                  </div>
                </li>
              </ul>
            </div>
            <div className="relative min-h-[400px] flex items-center justify-center bg-white/[0.01]">
              {/* Abstract Visual Representative */}
              <div className="absolute inset-0 monolithic-grid opacity-30"></div>
              <div className="relative w-64 h-64">
                <svg className="w-full h-full text-white/20" viewBox="0 0 200 200">
                  <circle cx="100" cy="100" fill="none" r="80" stroke="currentColor" strokeDasharray="4 4" strokeWidth="0.5"></circle>
                  <circle cx="100" cy="100" fill="none" r="60" stroke="currentColor" strokeWidth="1"></circle>
                  <path d="M100 20 L100 180 M20 100 L180 100" stroke="currentColor" strokeWidth="0.5"></path>
                  <rect className="opacity-80" fill="none" height="40" stroke="white" strokeWidth="1.5" width="40" x="80" y="80"></rect>
                </svg>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Call to Action */}
      <section className="relative py-48 px-8 md:px-16 text-center">
        <div className="max-w-3xl mx-auto">
          <h2 className="font-headline text-5xl md:text-7xl font-bold mb-12 tracking-tighter">Ready to<br/>Analyze?</h2>
          <div className="flex flex-col md:flex-row justify-center gap-6">
            <Link href="/start-a-project" className="bg-white text-black font-headline uppercase tracking-widest text-sm px-12 py-5 rounded-md hover:scale-105 transition-transform duration-300">Start Discovery</Link>
            <Link href="/our-process" className="glass-card text-white font-headline uppercase tracking-widest text-sm px-12 py-5 rounded-md hover:bg-white/10 transition-colors duration-300">View Methodology</Link>
          </div>
        </div>
      </section>
    </main>
  )
}
