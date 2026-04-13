// app/(admin)/admin/settings/page.tsx
// Server component — no 'use client'

import Link from 'next/link'

export default function SettingsPage() {
  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-headline font-bold text-on-surface">Settings</h1>

      {/* Platform */}
      <div className="pib-card space-y-2">
        <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant mb-3">Platform</p>
        {[
          { label: 'API Keys', desc: 'Manage API keys for AI agents and integrations', href: '/admin/settings/api-keys' },
        ].map(item => (
          <Link key={item.href} href={item.href} className="flex items-center justify-between p-3 rounded-[var(--radius-btn)] hover:bg-[var(--color-row-hover)] transition-colors">
            <div>
              <p className="text-sm font-medium text-on-surface">{item.label}</p>
              <p className="text-xs text-on-surface-variant mt-0.5">{item.desc}</p>
            </div>
            <span style={{ color: 'var(--color-accent-v2)' }}>→</span>
          </Link>
        ))}
      </div>

      {/* Account */}
      <section className="border border-outline-variant mb-6">
        <div className="px-5 py-3 border-b border-outline-variant">
          <span className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">
            Account
          </span>
        </div>
        <div className="divide-y divide-outline-variant">
          <div className="flex items-center justify-between px-5 py-4">
            <span className="text-sm text-on-surface-variant">Email</span>
            <span className="text-sm text-on-surface font-medium">
              peet.stander@partnersinbiz.online
            </span>
          </div>
          <div className="flex items-center justify-between px-5 py-4">
            <span className="text-sm text-on-surface-variant">Role</span>
            <span className="border border-green-700 text-[10px] font-label uppercase tracking-widest px-2 py-0.5 text-green-400">
              Admin
            </span>
          </div>
        </div>
      </section>

      {/* Integrations */}
      <section className="border border-outline-variant mb-6">
        <div className="px-5 py-3 border-b border-outline-variant">
          <span className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">
            Integrations
          </span>
        </div>
        <div className="divide-y divide-outline-variant">
          <div className="flex items-center justify-between px-5 py-4">
            <span className="text-sm text-on-surface-variant">Firebase / Firestore</span>
            <span className="flex items-center gap-2 text-sm text-green-400">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
              Connected
            </span>
          </div>
          <div className="flex items-center justify-between px-5 py-4">
            <span className="text-sm text-on-surface-variant">Resend Email</span>
            <span className="text-sm text-on-surface-variant">
              Check Vercel env vars
            </span>
          </div>
        </div>
      </section>

      {/* API Access */}
      <section className="border border-outline-variant">
        <div className="px-5 py-3 border-b border-outline-variant">
          <span className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">
            API Access
          </span>
        </div>
        <div className="divide-y divide-outline-variant">
          <div className="flex items-start justify-between px-5 py-4 gap-4">
            <span className="text-sm text-on-surface-variant">AI API Key</span>
            <span className="text-sm text-on-surface-variant text-right">
              Set via <code className="font-mono text-xs text-on-surface bg-surface-container px-1 py-0.5">ADMIN_EMAIL</code> env var
            </span>
          </div>
          <div className="flex items-start justify-between px-5 py-4 gap-4">
            <span className="text-sm text-on-surface-variant">Session Cookie</span>
            <span className="text-sm text-on-surface-variant text-right">
              14 days — configurable via{' '}
              <code className="font-mono text-xs text-on-surface bg-surface-container px-1 py-0.5">
                SESSION_EXPIRY_DAYS
              </code>
            </span>
          </div>
        </div>
      </section>
    </div>
  )
}
