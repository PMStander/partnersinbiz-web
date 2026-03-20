import type { Metadata } from 'next'
import StartProjectForm from './StartProjectForm'

export const metadata: Metadata = {
  title: 'Start a Project | PiB',
  description: "Tell us about your ambition. We'll build the machine to reach it.",
}

export default function StartProjectPage() {
  return (
    <>
      {/* Background Video */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <video
          autoPlay
          loop
          muted
          playsInline
          className="absolute top-1/2 left-1/2 min-w-full min-h-full -translate-x-1/2 -translate-y-1/2 object-cover brightness-[0.25]"
        >
          <source
            src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260302_141646_a5156969-0608-4d43-9e34-90f4716d1f32.mp4"
            type="video/mp4"
          />
        </video>
        <div className="absolute inset-0 bg-black/40" />
      </div>

      <main className="relative z-10 pt-32 pb-24 px-8 md:px-16 min-h-screen flex flex-col items-center">
        {/* Hero */}
        <header className="w-full max-w-5xl mb-20 text-center">
          <div className="inline-block px-3 py-1 mb-6 border border-white/20 rounded-full">
            <span className="font-label text-[0.6rem] uppercase tracking-[0.3em] text-white/50">
              Project Inquiry Portal v2.0
            </span>
          </div>
          <h1 className="font-headline text-5xl md:text-8xl font-bold tracking-tighter mb-8 leading-none">
            Start a Project
          </h1>
          <p className="font-body text-xl md:text-2xl text-white/60 max-w-2xl mx-auto font-light leading-relaxed">
            Tell us about your ambition. We&apos;ll build the machine to reach it.
          </p>
        </header>

        <StartProjectForm />

        {/* Bottom info section */}
        <div className="w-full max-w-4xl mt-24 grid grid-cols-1 md:grid-cols-3 gap-12 px-4">
          <div className="space-y-4">
            <span className="material-symbols-outlined text-white/20 text-3xl">precision_manufacturing</span>
            <h3 className="font-headline text-lg uppercase tracking-tight">Technical Audit</h3>
            <p className="text-white/40 text-sm leading-relaxed">
              Every project begins with a deep architectural audit to ensure scalability from day zero.
            </p>
          </div>
          <div className="space-y-4">
            <span className="material-symbols-outlined text-white/20 text-3xl">speed</span>
            <h3 className="font-headline text-lg uppercase tracking-tight">Rapid Prototyping</h3>
            <p className="text-white/40 text-sm leading-relaxed">
              We bypass the fluff and move straight into functional engineering to validate your core thesis.
            </p>
          </div>
          <div className="space-y-4">
            <span className="material-symbols-outlined text-white/20 text-3xl">verified</span>
            <h3 className="font-headline text-lg uppercase tracking-tight">Guaranteed Impact</h3>
            <p className="text-white/40 text-sm leading-relaxed">
              Engineered solutions measured by performance metrics, not just aesthetic appeal.
            </p>
          </div>
        </div>
      </main>
    </>
  )
}
