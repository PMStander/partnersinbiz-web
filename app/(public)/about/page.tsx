import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'About Us | PiB',
  description: 'Learn about Partners in Biz — our mission, team, and values.',
}

export default function AboutPage() {
  return (
    <main>
      {/* Hero Section */}
      <header className="relative min-h-screen flex flex-col justify-center px-8 md:px-16 pt-32 pb-20 overflow-hidden">
        {/* Abstract background elements */}
        <div className="absolute top-1/4 -right-1/4 w-96 h-96 bg-white/5 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-1/4 -left-1/4 w-64 h-64 bg-white/10 rounded-full blur-[100px]"></div>
        <div className="max-w-6xl relative z-10">
          <p className="font-label text-[0.6875rem] uppercase tracking-widest text-white/40 mb-6">Introduction</p>
          <h1 className="font-headline text-6xl md:text-[6.5rem] leading-[0.9] font-bold tracking-tighter mb-10">
            THE ARCHITECTS OF<br />PERFORMANCE
          </h1>
          <p className="font-body text-xl md:text-2xl text-white/60 max-w-2xl font-light leading-relaxed">
            We engineer digital ecosystems for the next generation of industry leaders. Driven by precision, powered by innovation.
          </p>
        </div>
      </header>

      {/* Mission & Values */}
      <section className="px-8 md:px-16 py-24 md:py-48">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-12">
          <div className="md:col-span-4">
            <p className="font-label text-[0.6875rem] uppercase tracking-widest text-white/40 mb-4">The Foundation</p>
            <h2 className="font-headline text-4xl font-bold tracking-tight">Our Identity</h2>
          </div>
          <div className="md:col-span-8 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="glass-card p-8 rounded-2xl flex flex-col h-full">
              <span className="material-symbols-outlined text-3xl mb-12 opacity-80">target</span>
              <h3 className="font-headline text-xl font-bold mb-4 uppercase">Precision</h3>
              <p className="font-body text-sm text-white/50 leading-relaxed">Absolute clarity in execution. We believe that marginal gains in engineering lead to exponential results in performance.</p>
            </div>
            <div className="glass-card p-8 rounded-2xl flex flex-col h-full">
              <span className="material-symbols-outlined text-3xl mb-12 opacity-80">lightbulb</span>
              <h3 className="font-headline text-xl font-bold mb-4 uppercase">Innovation</h3>
              <p className="font-body text-sm text-white/50 leading-relaxed">Constant iteration of the status quo. We don&apos;t just use technology; we redefine its application for complex problems.</p>
            </div>
            <div className="glass-card p-8 rounded-2xl flex flex-col h-full">
              <span className="material-symbols-outlined text-3xl mb-12 opacity-80">rocket_launch</span>
              <h3 className="font-headline text-xl font-bold mb-4 uppercase">Boundary-pushing</h3>
              <p className="font-body text-sm text-white/50 leading-relaxed">The &apos;P-i-B&apos; philosophy. We operate at the absolute edge of what&apos;s possible, ensuring our partners are always ahead.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Expertise (Bento Grid) */}
      <section className="px-8 md:px-16 py-24 bg-black">
        <div className="mb-20">
          <p className="font-label text-[0.6875rem] uppercase tracking-widest text-white/40 mb-4">Core Competencies</p>
          <h2 className="font-headline text-4xl font-bold tracking-tight">Technical Mastery</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 auto-rows-[280px]">
          <div className="md:col-span-2 md:row-span-2 glass-card rounded-2xl p-10 flex flex-col justify-between group overflow-hidden relative">
            <div className="relative z-10">
              <h3 className="font-headline text-3xl font-bold mb-4">Strategic Architecture</h3>
              <p className="font-body text-white/60 max-w-sm">Designing scalable foundations that support hyper-growth and complex data orchestration.</p>
            </div>
            <div className="absolute -bottom-20 -right-20 w-80 h-80 bg-white/[0.02] rounded-full border border-white/10 group-hover:scale-110 transition-transform duration-700"></div>
            <span className="material-symbols-outlined text-5xl opacity-20 self-end relative z-10">architecture</span>
          </div>
          <div className="md:col-span-2 glass-card rounded-2xl p-10 flex items-center justify-between group">
            <div>
              <h3 className="font-headline text-2xl font-bold mb-2">High-Fidelity Engineering</h3>
              <p className="font-body text-sm text-white/60">Crafting code with surgical precision.</p>
            </div>
            <span className="material-symbols-outlined text-4xl opacity-40 group-hover:translate-x-2 transition-transform">developer_mode</span>
          </div>
          <div className="md:col-span-2 glass-card rounded-2xl p-10 flex items-center justify-between group">
            <div>
              <h3 className="font-headline text-2xl font-bold mb-2">AI Optimization</h3>
              <p className="font-body text-sm text-white/60">Integrating intelligence into every workflow.</p>
            </div>
            <span className="material-symbols-outlined text-4xl opacity-40 group-hover:rotate-12 transition-transform">psychology</span>
          </div>
        </div>
      </section>

      {/* Timeline Section */}
      <section className="px-8 md:px-16 py-24 md:py-48 bg-black">
        <div className="max-w-4xl mx-auto">
          <p className="font-label text-[0.6875rem] uppercase tracking-widest text-white/40 mb-12 text-center">Evolution</p>
          <div className="space-y-0 relative">
            {/* Vertical line indicator */}
            <div className="absolute left-0 md:left-1/2 top-0 bottom-0 w-[1px] bg-white/10 -translate-x-1/2"></div>

            <div className="relative flex flex-col md:flex-row items-start md:items-center py-16 group">
              <div className="md:w-1/2 md:pr-24 md:text-right pl-8 md:pl-0">
                <span className="font-headline text-4xl font-bold text-white/20 group-hover:text-white transition-colors duration-500">2018</span>
                <h4 className="font-headline text-xl font-bold mt-2">Founding</h4>
                <p className="font-body text-sm text-white/40 mt-2">PiB was established as a boutique performance lab in London.</p>
              </div>
              <div className="absolute left-0 md:left-1/2 w-3 h-3 rounded-full bg-white -translate-x-1/2 z-10 border-4 border-black"></div>
            </div>

            <div className="relative flex flex-col md:flex-row-reverse items-start md:items-center py-16 group">
              <div className="md:w-1/2 md:pl-24 pl-8">
                <span className="font-headline text-4xl font-bold text-white/20 group-hover:text-white transition-colors duration-500">2020</span>
                <h4 className="font-headline text-xl font-bold mt-2">Expansion</h4>
                <p className="font-body text-sm text-white/40 mt-2">Global reach with offices in Tokyo and New York. Scaling the Monolithic approach.</p>
              </div>
              <div className="absolute left-0 md:left-1/2 w-3 h-3 rounded-full bg-white -translate-x-1/2 z-10 border-4 border-black"></div>
            </div>

            <div className="relative flex flex-col md:flex-row items-start md:items-center py-16 group">
              <div className="md:w-1/2 md:pr-24 md:text-right pl-8 md:pl-0">
                <span className="font-headline text-4xl font-bold text-white/20 group-hover:text-white transition-colors duration-500">2022</span>
                <h4 className="font-headline text-xl font-bold mt-2">AI Integration</h4>
                <p className="font-body text-sm text-white/40 mt-2">Pivoting core architecture to be AI-native, redefining high-performance tech stacks.</p>
              </div>
              <div className="absolute left-0 md:left-1/2 w-3 h-3 rounded-full bg-white -translate-x-1/2 z-10 border-4 border-black"></div>
            </div>

            <div className="relative flex flex-col md:flex-row-reverse items-start md:items-center py-16 group">
              <div className="md:w-1/2 md:pl-24 pl-8">
                <span className="font-headline text-4xl font-bold text-white/20 group-hover:text-white transition-colors duration-500">NOW</span>
                <h4 className="font-headline text-xl font-bold mt-2">Present Day</h4>
                <p className="font-body text-sm text-white/40 mt-2">Leading the industry in autonomous infrastructure and cognitive interfaces.</p>
              </div>
              <div className="absolute left-0 md:left-1/2 w-3 h-3 rounded-full bg-white -translate-x-1/2 z-10 border-4 border-black shadow-[0_0_15px_rgba(255,255,255,0.5)]"></div>
            </div>
          </div>
        </div>
      </section>

      {/* Culture/Team */}
      <section className="px-8 md:px-16 py-24 md:py-48 overflow-hidden">
        <div className="flex flex-col md:flex-row justify-between items-end mb-20 gap-8">
          <div className="max-w-xl">
            <p className="font-label text-[0.6875rem] uppercase tracking-widest text-white/40 mb-4">Culture</p>
            <h2 className="font-headline text-6xl font-bold tracking-tighter">OUR DNA</h2>
          </div>
          <p className="font-body text-white/50 max-w-sm mb-2">We are a collective of specialists, engineers, and visionaries unified by a singular pursuit of excellence.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="aspect-[3/4] rounded-2xl overflow-hidden glass-card relative group">
            <img
              className="w-full h-full object-cover grayscale brightness-75 group-hover:scale-105 transition-transform duration-1000"
              alt="Monochrome portrait of a professional male engineer"
              src="/images/team-marcus.png"
            />
            <div className="absolute bottom-0 left-0 p-6 w-full bg-gradient-to-t from-black/80 to-transparent">
              <p className="font-headline font-bold text-lg">Marcus Chen</p>
              <p className="font-label text-[0.6rem] uppercase tracking-widest text-white/60">Systems Lead</p>
            </div>
          </div>
          <div className="aspect-[3/4] rounded-2xl overflow-hidden glass-card relative group mt-8">
            <img
              className="w-full h-full object-cover grayscale brightness-75 group-hover:scale-105 transition-transform duration-1000"
              alt="Monochrome portrait of a professional female lead architect"
              src="/images/team-elena.png"
            />
            <div className="absolute bottom-0 left-0 p-6 w-full bg-gradient-to-t from-black/80 to-transparent">
              <p className="font-headline font-bold text-lg">Elena Vance</p>
              <p className="font-label text-[0.6rem] uppercase tracking-widest text-white/60">Lead Architect</p>
            </div>
          </div>
          <div className="aspect-[3/4] rounded-2xl overflow-hidden glass-card relative group">
            <img
              className="w-full h-full object-cover grayscale brightness-75 group-hover:scale-105 transition-transform duration-1000"
              alt="Monochrome portrait of a tech visionary male executive"
              src="/images/team-julian.png"
            />
            <div className="absolute bottom-0 left-0 p-6 w-full bg-gradient-to-t from-black/80 to-transparent">
              <p className="font-headline font-bold text-lg">Julian Voss</p>
              <p className="font-label text-[0.6rem] uppercase tracking-widest text-white/60">Head of Strategy</p>
            </div>
          </div>
          <div className="aspect-[3/4] rounded-2xl overflow-hidden glass-card relative group mt-8">
            <div className="w-full h-full bg-white/5 flex items-center justify-center">
              <div className="w-24 h-24 rounded-full bg-white/10 border border-white/20 flex items-center justify-center">
                <span className="font-headline text-2xl font-bold text-white/40">ST</span>
              </div>
            </div>
            <div className="absolute bottom-0 left-0 p-6 w-full bg-gradient-to-t from-black/80 to-transparent">
              <p className="font-headline font-bold text-lg">Sarah Thorne</p>
              <p className="font-label text-[0.6rem] uppercase tracking-widest text-white/60">AI Research</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
