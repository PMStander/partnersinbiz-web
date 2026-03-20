'use client'

export default function StartProjectForm() {
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    // Submission logic will be wired up in Task 12
  }

  return (
    <section className="w-full max-w-4xl">
      <div className="glass-card p-8 md:p-16 relative overflow-hidden rounded-2xl">
        {/* Decorative blur element */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 blur-[80px] -mr-16 -mt-16 rounded-full" />
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-10">
          {/* Full Name */}
          <div className="flex flex-col gap-2">
            <label className="font-headline text-[0.7rem] uppercase tracking-widest text-white/40">Full Name</label>
            <input
              name="name"
              type="text"
              placeholder="ALEXANDER VANCE"
              className="bg-transparent border-0 border-b border-white/20 py-3 text-white font-body placeholder:text-white/10 focus:border-white focus:outline-none transition-colors"
            />
          </div>
          {/* Email Address */}
          <div className="flex flex-col gap-2">
            <label className="font-headline text-[0.7rem] uppercase tracking-widest text-white/40">Email Address</label>
            <input
              name="email"
              type="email"
              placeholder="CONTACT@DOMAIN.COM"
              className="bg-transparent border-0 border-b border-white/20 py-3 text-white font-body placeholder:text-white/10 focus:border-white focus:outline-none transition-colors"
            />
          </div>
          {/* Company Name */}
          <div className="flex flex-col gap-2">
            <label className="font-headline text-[0.7rem] uppercase tracking-widest text-white/40">Company Name</label>
            <input
              name="company"
              type="text"
              placeholder="SYSTEMS INC."
              className="bg-transparent border-0 border-b border-white/20 py-3 text-white font-body placeholder:text-white/10 focus:border-white focus:outline-none transition-colors"
            />
          </div>
          {/* Project Type */}
          <div className="flex flex-col gap-2">
            <label className="font-headline text-[0.7rem] uppercase tracking-widest text-white/40">Project Type</label>
            <div className="relative">
              <select
                name="projectType"
                className="w-full bg-transparent border-0 border-b border-white/20 py-3 text-white font-body focus:border-white focus:outline-none transition-colors appearance-none cursor-pointer"
              >
                <option className="bg-neutral-900" value="web">Web Development</option>
                <option className="bg-neutral-900" value="mobile">Mobile App</option>
                <option className="bg-neutral-900" value="ai">AI Solution</option>
                <option className="bg-neutral-900" value="design">Product Design</option>
              </select>
              <span className="material-symbols-outlined absolute right-0 top-3 text-white/30 pointer-events-none">
                expand_more
              </span>
            </div>
          </div>
          {/* Project Details */}
          <div className="md:col-span-2 flex flex-col gap-2 mt-4">
            <label className="font-headline text-[0.7rem] uppercase tracking-widest text-white/40">Project Details</label>
            <textarea
              name="details"
              rows={4}
              placeholder="DESCRIBE THE SCOPE, TIMELINE, AND OBJECTIVES..."
              className="bg-transparent border-0 border-b border-white/20 py-3 text-white font-body placeholder:text-white/10 focus:border-white focus:outline-none transition-colors resize-none"
            />
          </div>
          {/* CTA */}
          <div className="md:col-span-2 pt-8 flex flex-col md:flex-row justify-between items-center gap-8">
            <p className="font-body text-[0.75rem] text-white/30 max-w-sm">
              By submitting this inquiry, you agree to our processing of your data for communication regarding this request.
            </p>
            <button
              type="submit"
              className="group relative w-full md:w-auto bg-white text-black px-12 py-5 rounded-md font-headline font-bold uppercase tracking-widest text-sm hover:bg-white/90 transition-all active:scale-[0.98]"
            >
              Send Inquiry
              <span className="material-symbols-outlined align-middle ml-2 text-xl group-hover:translate-x-1 transition-transform">
                arrow_forward
              </span>
            </button>
          </div>
        </form>
      </div>
    </section>
  )
}
