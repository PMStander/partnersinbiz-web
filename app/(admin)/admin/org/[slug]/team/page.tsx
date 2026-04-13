'use client'
import { useParams } from 'next/navigation'

export default function TeamPage() {
  const { slug } = useParams()
  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant mb-1">Workspace / Team</p>
        <h1 className="text-2xl font-headline font-bold text-on-surface">Team</h1>
      </div>
      <div className="pib-card py-12 text-center">
        <p className="text-on-surface-variant text-sm">Team management coming soon.</p>
      </div>
    </div>
  )
}
