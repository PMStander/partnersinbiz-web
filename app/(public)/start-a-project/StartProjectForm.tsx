'use client'
import { useState } from 'react'

type Status = 'idle' | 'loading' | 'success' | 'error'

export default function StartProjectForm() {
  const [status, setStatus] = useState<Status>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setStatus('loading')
    setErrorMsg('')
    const form = new FormData(e.currentTarget)
    const payload = {
      name: form.get('name'),
      email: form.get('email'),
      company: form.get('company'),
      projectType: form.get('projectType'),
      details: form.get('details'),
    }
    try {
      const res = await fetch('/api/enquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Submission failed')
      }
      setStatus('success')
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong.')
      setStatus('error')
    }
  }

  if (status === 'success') {
    return (
      <section className="w-full max-w-4xl">
        <div className="glass-card p-16 text-center">
          <span className="material-symbols-outlined text-5xl text-white/60 mb-6 block">check_circle</span>
          <h2 className="font-headline text-3xl font-bold tracking-tighter mb-4">Inquiry Received</h2>
          <p className="text-white/50">We&apos;ll be in touch within 24 hours.</p>
        </div>
      </section>
    )
  }

  return (
    <section className="w-full max-w-4xl">
      <div className="glass-card p-8 md:p-16 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 blur-[80px] -mr-16 -mt-16 rounded-full" />
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-10">
          {/* Full Name */}
          <div className="flex flex-col gap-2">
            <label className="font-headline text-[0.7rem] uppercase tracking-widest text-white/40">Full Name</label>
            <input name="name" type="text" placeholder="ALEXANDER VANCE"
              className="bg-transparent border-0 border-b border-white/20 py-3 text-white font-body placeholder:text-white/10 focus:border-white focus:outline-none transition-colors" />
          </div>
          {/* Email */}
          <div className="flex flex-col gap-2">
            <label className="font-headline text-[0.7rem] uppercase tracking-widest text-white/40">Email Address</label>
            <input name="email" type="email" placeholder="CONTACT@DOMAIN.COM"
              className="bg-transparent border-0 border-b border-white/20 py-3 text-white font-body placeholder:text-white/10 focus:border-white focus:outline-none transition-colors" />
          </div>
          {/* Company */}
          <div className="flex flex-col gap-2">
            <label className="font-headline text-[0.7rem] uppercase tracking-widest text-white/40">Company Name</label>
            <input name="company" type="text" placeholder="SYSTEMS INC."
              className="bg-transparent border-0 border-b border-white/20 py-3 text-white font-body placeholder:text-white/10 focus:border-white focus:outline-none transition-colors" />
          </div>
          {/* Project Type */}
          <div className="flex flex-col gap-2">
            <label className="font-headline text-[0.7rem] uppercase tracking-widest text-white/40">Project Type</label>
            <div className="relative">
              <select name="projectType"
                className="w-full bg-transparent border-0 border-b border-white/20 py-3 text-white font-body focus:border-white focus:outline-none transition-colors appearance-none cursor-pointer">
                <option className="bg-neutral-900" value="web">Web Development</option>
                <option className="bg-neutral-900" value="mobile">Mobile App</option>
                <option className="bg-neutral-900" value="ai">AI Solution</option>
                <option className="bg-neutral-900" value="design">Product Design</option>
              </select>
              <span className="material-symbols-outlined absolute right-0 top-3 text-white/30 pointer-events-none">expand_more</span>
            </div>
          </div>
          {/* Project Details */}
          <div className="md:col-span-2 flex flex-col gap-2 mt-4">
            <label className="font-headline text-[0.7rem] uppercase tracking-widest text-white/40">Project Details</label>
            <textarea name="details" rows={4} placeholder="DESCRIBE THE SCOPE, TIMELINE, AND OBJECTIVES..."
              className="bg-transparent border-0 border-b border-white/20 py-3 text-white font-body placeholder:text-white/10 focus:border-white focus:outline-none transition-colors resize-none" />
          </div>
          {/* Error message */}
          {status === 'error' && (
            <div className="md:col-span-2">
              <p className="text-red-400 text-sm">{errorMsg}</p>
            </div>
          )}
          {/* CTA */}
          <div className="md:col-span-2 pt-8 flex flex-col md:flex-row justify-between items-center gap-8">
            <p className="font-body text-[0.75rem] text-white/30 max-w-sm">
              By submitting this inquiry, you agree to our processing of your data for communication regarding this request.
            </p>
            <button type="submit" disabled={status === 'loading'}
              className="group relative w-full md:w-auto bg-white text-black px-12 py-5 rounded-md font-headline font-bold uppercase tracking-widest text-sm hover:bg-white/90 transition-all active:scale-[0.98] disabled:opacity-50">
              {status === 'loading' ? 'Sending...' : 'Send Inquiry'}
              {status !== 'loading' && (
                <span className="material-symbols-outlined align-middle ml-2 text-xl group-hover:translate-x-1 transition-transform">arrow_forward</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </section>
  )
}
