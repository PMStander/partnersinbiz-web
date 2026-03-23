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
                <span className="font-headline text-4xl font-bold text-white/20 group-hover:text-white transition-colors duration-500">2010</span>
                <h4 className="font-headline text-xl font-bold mt-2">The Beginning</h4>
                <p className="font-body text-sm text-white/40 mt-2">Started coding — driven by a relentless need to build things that actually work at scale.</p>
              </div>
              <div className="absolute left-0 md:left-1/2 w-3 h-3 rounded-full bg-white -translate-x-1/2 z-10 border-4 border-black"></div>
            </div>

            <div className="relative flex flex-col md:flex-row-reverse items-start md:items-center py-16 group">
              <div className="md:w-1/2 md:pl-24 pl-8">
                <span className="font-headline text-4xl font-bold text-white/20 group-hover:text-white transition-colors duration-500">2015</span>
                <h4 className="font-headline text-xl font-bold mt-2">Going Deep</h4>
                <p className="font-body text-sm text-white/40 mt-2">Mastered full-stack engineering across multiple industries — from fintech to SaaS to consumer platforms.</p>
              </div>
              <div className="absolute left-0 md:left-1/2 w-3 h-3 rounded-full bg-white -translate-x-1/2 z-10 border-4 border-black"></div>
            </div>

            <div className="relative flex flex-col md:flex-row items-start md:items-center py-16 group">
              <div className="md:w-1/2 md:pr-24 md:text-right pl-8 md:pl-0">
                <span className="font-headline text-4xl font-bold text-white/20 group-hover:text-white transition-colors duration-500">2022</span>
                <h4 className="font-headline text-xl font-bold mt-2">AI&#8209;Native</h4>
                <p className="font-body text-sm text-white/40 mt-2">Early adopter of AI-integrated development — rebuilt the entire engineering workflow around intelligent automation.</p>
              </div>
              <div className="absolute left-0 md:left-1/2 w-3 h-3 rounded-full bg-white -translate-x-1/2 z-10 border-4 border-black"></div>
            </div>

            <div className="relative flex flex-col md:flex-row-reverse items-start md:items-center py-16 group">
              <div className="md:w-1/2 md:pl-24 pl-8">
                <span className="font-headline text-4xl font-bold text-white/20 group-hover:text-white transition-colors duration-500">2026</span>
                <h4 className="font-headline text-xl font-bold mt-2">Partners in Biz</h4>
                <p className="font-body text-sm text-white/40 mt-2">Launched PiB to bring senior-level engineering directly to ambitious brands — without the agency overhead.</p>
              </div>
              <div className="absolute left-0 md:left-1/2 w-3 h-3 rounded-full bg-white -translate-x-1/2 z-10 border-4 border-black shadow-[0_0_15px_rgba(255,255,255,0.5)]"></div>
            </div>
          </div>
        </div>
      </section>

      {/* Capabilities */}
      <section className="px-8 md:px-16 py-24 md:py-48 overflow-hidden">
        <div className="flex flex-col md:flex-row justify-between items-end mb-20 gap-8">
          <div className="max-w-xl">
            <p className="font-label text-[0.6875rem] uppercase tracking-widest text-white/40 mb-4">Capabilities</p>
            <h2 className="font-headline text-6xl font-bold tracking-tighter">OUR DNA</h2>
          </div>
          <p className="font-body text-white/50 max-w-sm mb-2">Four disciplines, one standard — every engagement draws on the full depth of what we do.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Strategy */}
          <div className="aspect-[3/4] rounded-2xl overflow-hidden glass-card relative group">
            <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-white/3 to-transparent group-hover:from-white/15 transition-all duration-1000" />
            <div className="absolute inset-0 opacity-20 group-hover:opacity-30 transition-opacity duration-1000"
              style={{ backgroundImage: 'radial-gradient(circle at 30% 20%, rgba(255,255,255,0.15) 0%, transparent 60%), radial-gradient(circle at 80% 80%, rgba(255,255,255,0.08) 0%, transparent 50%)' }} />
            <div className="absolute top-8 left-8 right-8">
              <span className="font-headline text-7xl font-bold text-white/8 select-none">01</span>
            </div>
            <div className="absolute inset-0 flex items-center justify-center p-8">
              <p className="font-headline text-2xl font-bold text-white/70 text-center leading-tight group-hover:text-white/90 transition-colors duration-700">
                Clarity<br />before<br />commitment.
              </p>
            </div>
            <div className="absolute bottom-0 left-0 p-6 w-full bg-gradient-to-t from-black/80 to-transparent">
              <p className="font-headline font-bold text-lg">Strategy</p>
              <p className="font-label text-[0.6rem] uppercase tracking-widest text-white/60">We map the path before we move</p>
            </div>
          </div>
          {/* Engineering */}
          <div className="aspect-[3/4] rounded-2xl overflow-hidden glass-card relative group mt-8">
            <div className="absolute inset-0 bg-gradient-to-br from-white/8 via-white/2 to-transparent group-hover:from-white/13 transition-all duration-1000" />
            <div className="absolute inset-0 opacity-20 group-hover:opacity-30 transition-opacity duration-1000"
              style={{ backgroundImage: 'radial-gradient(circle at 70% 30%, rgba(255,255,255,0.12) 0%, transparent 55%), radial-gradient(circle at 20% 75%, rgba(255,255,255,0.1) 0%, transparent 50%)' }} />
            <div className="absolute top-8 left-8 right-8">
              <span className="font-headline text-7xl font-bold text-white/8 select-none">02</span>
            </div>
            <div className="absolute inset-0 flex items-center justify-center p-8">
              <p className="font-headline text-2xl font-bold text-white/70 text-center leading-tight group-hover:text-white/90 transition-colors duration-700">
                Systems that<br />outlast<br />the trend.
              </p>
            </div>
            <div className="absolute bottom-0 left-0 p-6 w-full bg-gradient-to-t from-black/80 to-transparent">
              <p className="font-headline font-bold text-lg">Engineering</p>
              <p className="font-label text-[0.6rem] uppercase tracking-widest text-white/60">Built to last, designed to scale</p>
            </div>
          </div>
          {/* Design */}
          <div className="aspect-[3/4] rounded-2xl overflow-hidden glass-card relative group">
            <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-white/3 to-transparent group-hover:from-white/15 transition-all duration-1000" />
            <div className="absolute inset-0 opacity-20 group-hover:opacity-30 transition-opacity duration-1000"
              style={{ backgroundImage: 'radial-gradient(circle at 50% 25%, rgba(255,255,255,0.15) 0%, transparent 60%), radial-gradient(circle at 85% 70%, rgba(255,255,255,0.07) 0%, transparent 45%)' }} />
            <div className="absolute top-8 left-8 right-8">
              <span className="font-headline text-7xl font-bold text-white/8 select-none">03</span>
            </div>
            <div className="absolute inset-0 flex items-center justify-center p-8">
              <p className="font-headline text-2xl font-bold text-white/70 text-center leading-tight group-hover:text-white/90 transition-colors duration-700">
                Form follows<br />function<br />follows feeling.
              </p>
            </div>
            <div className="absolute bottom-0 left-0 p-6 w-full bg-gradient-to-t from-black/80 to-transparent">
              <p className="font-headline font-bold text-lg">Design</p>
              <p className="font-label text-[0.6rem] uppercase tracking-widest text-white/60">Interfaces that earn trust instantly</p>
            </div>
          </div>
          {/* Growth */}
          <div className="aspect-[3/4] rounded-2xl overflow-hidden glass-card relative group mt-8">
            <div className="absolute inset-0 bg-gradient-to-br from-white/8 via-white/2 to-transparent group-hover:from-white/13 transition-all duration-1000" />
            <div className="absolute inset-0 opacity-20 group-hover:opacity-30 transition-opacity duration-1000"
              style={{ backgroundImage: 'radial-gradient(circle at 25% 40%, rgba(255,255,255,0.12) 0%, transparent 55%), radial-gradient(circle at 75% 80%, rgba(255,255,255,0.1) 0%, transparent 50%)' }} />
            <div className="absolute top-8 left-8 right-8">
              <span className="font-headline text-7xl font-bold text-white/8 select-none">04</span>
            </div>
            <div className="absolute inset-0 flex items-center justify-center p-8">
              <p className="font-headline text-2xl font-bold text-white/70 text-center leading-tight group-hover:text-white/90 transition-colors duration-700">
                Earned<br />momentum,<br />not metrics.
              </p>
            </div>
            <div className="absolute bottom-0 left-0 p-6 w-full bg-gradient-to-t from-black/80 to-transparent">
              <p className="font-headline font-bold text-lg">Growth</p>
              <p className="font-label text-[0.6rem] uppercase tracking-widest text-white/60">Sustainable traction, not vanity metrics</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
