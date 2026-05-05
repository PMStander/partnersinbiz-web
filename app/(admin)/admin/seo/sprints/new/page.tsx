'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useOrg } from '@/lib/contexts/OrgContext'

interface OrgChoice {
  id: string
  name: string
  slug?: string
  websiteUrl?: string
}

function NewSprintForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { selectedOrgId, orgs: contextOrgs } = useOrg()

  const [orgs, setOrgs] = useState<OrgChoice[]>([])
  const [clientId, setClientId] = useState('')
  const [siteUrl, setSiteUrl] = useState('')
  const [siteName, setSiteName] = useState('')
  const [autopilotMode, setAutopilotMode] = useState<'off' | 'safe' | 'full'>('safe')
  const [pagespeedEnabled, setPagespeedEnabled] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Resolve list of organisations from context (or fetch as fallback). The
  // `clientId` here is the Firestore organization id — same pattern the rest
  // of the SEO module uses (`orgId` and `clientId` are both the org doc id).
  useEffect(() => {
    if (contextOrgs.length > 0) {
      setOrgs(
        contextOrgs.map((o) => ({
          id: o.id,
          name: o.name,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          slug: (o as any).slug,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          websiteUrl: (o as any).websiteUrl,
        })),
      )
      return
    }
    void (async () => {
      try {
        const res = await fetch('/api/v1/organizations')
        const json = await res.json()
        if (json.success ?? json.data) setOrgs(json.data ?? [])
      } catch {
        // ignore
      }
    })()
  }, [contextOrgs])

  // Pre-fill from URL query params and/or workspace context. Priority:
  //   1. ?orgId / ?clientId from URL  → set explicitly
  //   2. selectedOrgId from OrgContext (workspace mode)
  //   3. nothing — user picks from dropdown
  useEffect(() => {
    const qOrgId = searchParams?.get('orgId') ?? searchParams?.get('clientId') ?? ''
    const qSiteName = searchParams?.get('siteName') ?? ''
    const qSiteUrl = searchParams?.get('siteUrl') ?? ''

    if (qOrgId) {
      setClientId(qOrgId)
    } else if (selectedOrgId) {
      setClientId(selectedOrgId)
    }

    if (qSiteName) setSiteName(qSiteName)
    if (qSiteUrl) setSiteUrl(qSiteUrl)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, selectedOrgId])

  // When the selected client changes, auto-fill siteName from the org if not
  // already set.
  useEffect(() => {
    if (!clientId) return
    const org = orgs.find((o) => o.id === clientId)
    if (!org) return
    if (!siteName) setSiteName(org.name)
    if (!siteUrl && org.websiteUrl) setSiteUrl(org.websiteUrl)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, orgs])

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
        body: JSON.stringify({
          // We send orgId AND clientId as the same value — Pip skill / API both honour either
          orgId: clientId,
          clientId,
          siteUrl,
          siteName,
          autopilotMode,
          pagespeedEnabled,
        }),
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

  const selectedOrg = orgs.find((o) => o.id === clientId)

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
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          {selectedOrg && (
            <p className="text-xs text-[var(--color-pib-text-muted)] mt-1">
              Pre-filled from workspace context.
            </p>
          )}
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

export default function NewSprintPage() {
  // useSearchParams must be inside a Suspense boundary
  return (
    <Suspense fallback={<div className="text-sm text-[var(--color-pib-text-muted)]">Loading…</div>}>
      <NewSprintForm />
    </Suspense>
  )
}
