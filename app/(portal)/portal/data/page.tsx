'use client'
export const dynamic = 'force-dynamic'

import { useState } from 'react'

export default function PortalData() {
  const today = new Date().toISOString().slice(0, 10)
  const ninetyAgo = (() => { const d = new Date(); d.setUTCDate(d.getUTCDate() - 90); return d.toISOString().slice(0, 10) })()
  const [from, setFrom] = useState(ninetyAgo)
  const [to, setTo] = useState(today)

  function dl(format: 'csv' | 'json') {
    const url = `/api/v1/portal/data-export?format=${format}&from=${from}&to=${to}`
    window.location.href = url
  }

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="font-headline text-2xl font-bold tracking-tighter">Your data</h1>
        <p className="text-sm text-[var(--color-on-surface-variant)] mt-1">
          Every metric we record about your business — yours to download. No lock-in.
        </p>
      </div>

      <div className="pib-card space-y-5">
        <div>
          <p className="text-xs font-label uppercase tracking-widest text-[var(--color-on-surface-variant)] mb-3">Date range</p>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-[var(--color-on-surface-variant)]">From</span>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} max={to}
                className="mt-1 w-full bg-white/[0.04] border border-[var(--color-outline-variant)] rounded-lg px-3 py-2 text-sm text-[var(--color-on-surface)]" />
            </label>
            <label className="block">
              <span className="text-xs text-[var(--color-on-surface-variant)]">To</span>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} max={today}
                className="mt-1 w-full bg-white/[0.04] border border-[var(--color-outline-variant)] rounded-lg px-3 py-2 text-sm text-[var(--color-on-surface)]" />
            </label>
          </div>
        </div>

        <div>
          <p className="text-xs font-label uppercase tracking-widest text-[var(--color-on-surface-variant)] mb-3">Export format</p>
          <div className="flex gap-3">
            <button
              onClick={() => dl('csv')}
              className="px-4 py-2 text-sm rounded-full bg-[var(--color-accent-v2)] text-[var(--color-bg)] font-medium uppercase tracking-widest font-label"
            >
              Download CSV
            </button>
            <button
              onClick={() => dl('json')}
              className="px-4 py-2 text-sm rounded-full border border-[var(--color-outline-variant)] text-[var(--color-on-surface)] font-medium uppercase tracking-widest font-label"
            >
              Download JSON
            </button>
          </div>
        </div>
      </div>

      <div className="pib-card">
        <p className="text-xs font-label uppercase tracking-widest text-[var(--color-on-surface-variant)] mb-2">What's in the export</p>
        <ul className="text-sm text-[var(--color-on-surface)] space-y-1.5 leading-relaxed">
          <li>• Daily metric rows from every connected source — RevenueCat, AdSense, AdMob, App Store Connect, Play Console, Google Ads, GA4.</li>
          <li>• Original currency + ZAR-converted value (FX rate at row's date).</li>
          <li>• Optional breakdown by ad unit, country, source/medium, or app.</li>
          <li>• Every row carries the date, property, source, metric kind, and raw provider payload (in JSON exports).</li>
        </ul>
      </div>
    </div>
  )
}
