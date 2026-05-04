'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = { id: string; name: string; orgId?: string }

export default function NewSprintPage() {
  const router = useRouter()
  const [clients, setClients] = useState<Client[]>([])
  const [clientId, setClientId] = useState('')
  const [siteUrl, setSiteUrl] = useState('')
  const [siteName, setSiteName] = useState('')
  const [autopilotMode, setAutopilotMode] = useState<'off' | 'safe' | 'full'>('safe')
  const [pagespeedEnabled, setPagespeedEnabled] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/v1/clients')
        const json = await res.json()
        if (json.success) setClients(json.data ?? [])
      } catch {
        // ignore
      }
    })()
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!clientId || !siteUrl || !siteName) {
      setError('All fields required')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/v1/seo/sprints', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': `sprint-${Date.now()}` },
        body: JSON.stringify({ clientId, siteUrl, siteName, autopilotMode, pagespeedEnabled }),
      })
      const json = await res.json()
      if (!json.success) {
        setError(json.error ?? 'Failed to create sprint')
        setSubmitting(false)
        return
      }
      router.push(`/admin/seo/sprints/${json.data.id}/settings?welcome=1`)
    } catch (e) {
      setError((e as Error).message)
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">New SEO Sprint</h1>
        <p className="text-sm text-[var(--color-pib-text-muted)]">
          Creates a 90-day sprint seeded from the Outrank-90 template (42 tasks + 15 directories).
        </p>
      </header>

      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="text-sm font-medium">Client</span>
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="mt-1 w-full border rounded px-3 py-2 text-sm"
            required
          >
            <option value="">— pick client —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium">Site URL</span>
          <input
            type="url"
            value={siteUrl}
            onChange={(e) => setSiteUrl(e.target.value)}
            placeholder="https://example.com"
            className="mt-1 w-full border rounded px-3 py-2 text-sm"
            required
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium">Site name</span>
          <input
            type="text"
            value={siteName}
            onChange={(e) => setSiteName(e.target.value)}
            placeholder="Example Co."
            className="mt-1 w-full border rounded px-3 py-2 text-sm"
            required
          />
        </label>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Autopilot mode</legend>
          {(
            [
              ['off', 'Off — Pip drafts only, you approve everything'],
              ['safe', 'Safe (default) — Pip auto-executes drafts; queues anything that publishes'],
              ['full', 'Full — Pip publishes blog posts, repurposes to social, etc.'],
            ] as const
          ).map(([val, desc]) => (
            <label key={val} className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="autopilot"
                value={val}
                checked={autopilotMode === val}
                onChange={() => setAutopilotMode(val)}
                className="mt-1"
              />
              <span>{desc}</span>
            </label>
          ))}
        </fieldset>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={pagespeedEnabled}
            onChange={(e) => setPagespeedEnabled(e.target.checked)}
          />
          Enable PageSpeed Insights (Core Web Vitals)
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full px-4 py-2.5 rounded bg-black text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
        >
          {submitting ? 'Creating…' : 'Create sprint'}
        </button>
        <p className="text-xs text-[var(--color-pib-text-muted)]">
          After creating, you can connect Google Search Console and Bing Webmaster Tools from the sprint settings.
        </p>
      </form>
    </div>
  )
}
