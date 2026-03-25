import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'

export const metadata: Metadata = {
  title: 'Our Process | PiB',
  description: 'How we engineer digital solutions — our proven process from discovery to delivery.',
}

export default function OurProcessPage() {
  return (
    <main className="relative z-10 pt-32 pb-24 px-8 md:px-16">
      {/* Hero Section */}
      <section className="relative h-screen flex items-center justify-center overflow-hidden -mx-8 md:-mx-16 -mt-32 mb-48">
        {/* Background Image */}
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-black/60 z-10"></div>
          <Image
            src="/images/our-process-hero.png"
            alt="Abstract dark cinematic tech laboratory background"
            fill
            priority
            className="object-cover opacity-30 grayscale"
          />
          {/* Subtle moving orbs effect */}
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-white/5 rounded-full blur-[120px]"></div>
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-white/5 rounded-full blur-[120px]"></div>
        </div>
        <div className="relative z-20 px-8 md:px-16 text-center">
          <h1 className="font-headline text-[6rem] md:text-[12rem] leading-none font-bold tracking-tighter uppercase mb-6">
            PROCESS
          </h1>
          <p className="font-body text-xl md:text-2xl text-white/60 max-w-2xl mx-auto tracking-tight">
            The engineering behind every breakthrough.
          </p>
        </div>
      </section>

      {/* Process Stages */}
      <div className="space-y-48 pb-48">
        {/* 01 DISCOVER */}
        <section className="grid grid-cols-1 md:grid-cols-12 gap-12 items-start">
          <div className="md:col-span-5 space-y-8">
            <div className="font-label text-xs tracking-widest text-white/40 uppercase">Phase 01</div>
            <h2 className="font-headline text-5xl md:text-7xl font-bold tracking-tighter">DISCOVER</h2>
            <div className="h-1 w-24 bg-white"></div>
            <h3 className="text-2xl font-headline font-medium text-white/80">Architectural Deep-Dive.</h3>
            <p className="text-white/60 leading-relaxed text-lg max-w-md">
              We start with absolute clarity. Through intensive research, user mapping, and technical audits, we map the terrain before we lay a single line of code.
            </p>
            {/* Data Point Snippet */}
            <div className="glass-card rounded-2xl p-6 flex items-center gap-4 max-w-sm">
              <span className="material-symbols-outlined text-white text-3xl">analytics</span>
              <div>
                <div className="font-label text-[10px] tracking-widest text-white/40 uppercase">Case Study Snippet</div>
                <p className="text-sm font-medium">Reduced scope creep by 40% for Fintech client.</p>
              </div>
            </div>
          </div>
          <div className="md:col-span-7">
            <div className="glass-card rounded-2xl aspect-[16/10] overflow-hidden flex items-center justify-center p-8">
              <div className="grid grid-cols-2 gap-4 w-full h-full opacity-40">
                <div className="border border-white/10 rounded-xl p-4 flex flex-col justify-between">
                  <span className="material-symbols-outlined">query_stats</span>
                  <div className="h-2 w-full bg-white/10 rounded"></div>
                </div>
                <div className="border border-white/10 rounded-xl p-4 flex flex-col justify-between">
                  <span className="material-symbols-outlined">group</span>
                  <div className="h-2 w-2/3 bg-white/10 rounded"></div>
                </div>
                <div className="border border-white/10 rounded-xl p-4 flex flex-col justify-between">
                  <span className="material-symbols-outlined">architecture</span>
                  <div className="h-2 w-3/4 bg-white/10 rounded"></div>
                </div>
                <div className="border border-white/10 rounded-xl p-4 flex flex-col justify-between">
                  <span className="material-symbols-outlined">search_insights</span>
                  <div className="h-2 w-1/2 bg-white/10 rounded"></div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 02 DESIGN */}
        <section className="grid grid-cols-1 md:grid-cols-12 gap-12 items-start">
          <div className="md:col-span-7 order-2 md:order-1">
            <div className="glass-card rounded-2xl aspect-[16/10] overflow-hidden flex flex-col gap-3 p-6">
              <div className="opacity-40 flex flex-col gap-3 h-full">
                {/* Nav bar */}
                <div className="flex items-center gap-2">
                  <div className="w-16 h-2 bg-white/30 rounded"></div>
                  <div className="flex gap-2 ml-auto">
                    <div className="w-8 h-2 bg-white/15 rounded"></div>
                    <div className="w-8 h-2 bg-white/15 rounded"></div>
                    <div className="w-8 h-2 bg-white/15 rounded"></div>
                  </div>
                </div>
                {/* Hero + aside */}
                <div className="flex gap-3 flex-1">
                  <div className="flex-1 flex flex-col gap-2 justify-center">
                    <div className="w-3/4 h-3 bg-white/30 rounded"></div>
                    <div className="w-1/2 h-3 bg-white/30 rounded"></div>
                    <div className="w-full h-1.5 bg-white/15 rounded mt-2"></div>
                    <div className="w-5/6 h-1.5 bg-white/15 rounded"></div>
                    <div className="w-20 h-5 bg-white/20 rounded mt-3"></div>
                  </div>
                  <div className="w-1/3 bg-white/5 rounded-lg border border-white/10"></div>
                </div>
                {/* Bottom cards */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="h-10 bg-white/5 rounded border border-white/10"></div>
                  <div className="h-10 bg-white/5 rounded border border-white/10"></div>
                  <div className="h-10 bg-white/5 rounded border border-white/10"></div>
                </div>
              </div>
            </div>
          </div>
          <div className="md:col-span-5 space-y-8 order-1 md:order-2 md:pl-16">
            <div className="font-label text-xs tracking-widest text-white/40 uppercase">Phase 02</div>
            <h2 className="font-headline text-5xl md:text-7xl font-bold tracking-tighter">DESIGN</h2>
            <div className="h-1 w-24 bg-white"></div>
            <h3 className="text-2xl font-headline font-medium text-white/80">Visual Engineering.</h3>
            <p className="text-white/60 leading-relaxed text-lg max-w-md">
              Design is not decoration; it is performance. We build robust design systems and high-fidelity interfaces that prioritize mathematical precision and emotional resonance.
            </p>
            <div className="glass-card rounded-2xl p-6 flex items-center gap-4 max-w-sm">
              <span className="material-symbols-outlined text-white text-3xl">grid_view</span>
              <div>
                <div className="font-label text-[10px] tracking-widest text-white/40 uppercase">Impact Metric</div>
                <p className="text-sm font-medium">Created a unified design system for Global Corp.</p>
              </div>
            </div>
          </div>
        </section>

        {/* 03 DEVELOP */}
        <section className="grid grid-cols-1 md:grid-cols-12 gap-12 items-start">
          <div className="md:col-span-5 space-y-8">
            <div className="font-label text-xs tracking-widest text-white/40 uppercase">Phase 03</div>
            <h2 className="font-headline text-5xl md:text-7xl font-bold tracking-tighter">DEVELOP</h2>
            <div className="h-1 w-24 bg-white"></div>
            <h3 className="text-2xl font-headline font-medium text-white/80">Production-Grade Code.</h3>
            <p className="text-white/60 leading-relaxed text-lg max-w-md">
              Our engineering team transforms vision into reality. We specialize in high-concurrency architectures, seamless API integrations, and frontend experiences that feel instantaneous.
            </p>
            <div className="glass-card rounded-2xl p-6 flex items-center gap-4 max-w-sm">
              <span className="material-symbols-outlined text-white text-3xl">terminal</span>
              <div>
                <div className="font-label text-[10px] tracking-widest text-white/40 uppercase">SLA Milestone</div>
                <p className="text-sm font-medium">Achieved 99.9% uptime for E-commerce platform.</p>
              </div>
            </div>
          </div>
          <div className="md:col-span-7">
            <div className="glass-card rounded-2xl p-8 h-full flex flex-col justify-center">
              <div className="space-y-4 font-mono text-sm text-white/40">
                <div className="flex items-center gap-4"><span className="text-white/20">01</span> <span className="text-white">class</span> PerformanceEngine <span className="text-white">{'{'}</span></div>
                <div className="flex items-center gap-4"><span className="text-white/20">02</span>    async optimize(stack) {'{'}</div>
                <div className="flex items-center gap-4"><span className="text-white/20">03</span>      await stack.latency.minify();</div>
                <div className="flex items-center gap-4"><span className="text-white/20">04</span>      return stack.deploy();</div>
                <div className="flex items-center gap-4"><span className="text-white/20">05</span>    {'}'}</div>
                <div className="flex items-center gap-4"><span className="text-white/20">06</span> <span className="text-white">{'}'}</span></div>
              </div>
            </div>
          </div>
        </section>

        {/* 04 SCALE */}
        <section className="grid grid-cols-1 md:grid-cols-12 gap-12 items-start">
          <div className="md:col-span-7 order-2 md:order-1">
            <div className="glass-card rounded-2xl aspect-[16/10] overflow-hidden flex items-center justify-center p-12">
              <div className="w-full h-full border-l border-b border-white/20 relative">
                {/* Simulated Chart */}
                <div className="absolute bottom-0 left-0 w-full h-[80%] bg-gradient-to-tr from-white/10 to-transparent"></div>
                <svg
                  className="absolute bottom-0 left-0 w-full h-full"
                  preserveAspectRatio="none"
                  viewBox="0 0 100 100"
                >
                  <path d="M0 100 L20 80 L40 85 L60 40 L80 45 L100 5" fill="none" stroke="white" strokeWidth="0.5"></path>
                </svg>
              </div>
            </div>
          </div>
          <div className="md:col-span-5 space-y-8 order-1 md:order-2 md:pl-16">
            <div className="font-label text-xs tracking-widest text-white/40 uppercase">Phase 04</div>
            <h2 className="font-headline text-5xl md:text-7xl font-bold tracking-tighter">SCALE</h2>
            <div className="h-1 w-24 bg-white"></div>
            <h3 className="text-2xl font-headline font-medium text-white/80">Performance Optimization.</h3>
            <p className="text-white/60 leading-relaxed text-lg max-w-md">
              Launch is just the beginning. We continuously monitor, iterate, and optimize to ensure your product doesn&apos;t just survive traffic spikes—it thrives under pressure.
            </p>
            <div className="glass-card rounded-2xl p-6 flex items-center gap-4 max-w-sm">
              <span className="material-symbols-outlined text-white text-3xl">speed</span>
              <div>
                <div className="font-label text-[10px] tracking-widest text-white/40 uppercase">Scale Metric</div>
                <p className="text-sm font-medium">Scaled to 1M+ active users within 3 months.</p>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Bottom CTA Section */}
      <section className="-mx-8 md:-mx-16 px-8 md:px-16 py-32 bg-white text-black text-center space-y-12">
        <h2 className="font-headline text-5xl md:text-8xl font-bold tracking-tighter max-w-4xl mx-auto leading-none">
          Ready to Start? Build the future with PiB.
        </h2>
        <Link href="/start-a-project">
          <button className="bg-black text-white px-12 py-5 rounded-md font-headline text-xl font-bold tracking-tight hover:scale-105 transition-transform duration-300">
            Start a Project
          </button>
        </Link>
      </section>
    </main>
  )
}
