'use client'

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'next/navigation'

type Capabilities = {
  runs: boolean
  dashboard: boolean
  cron: boolean
  models: boolean
  tools: boolean
  files: boolean
  terminal: boolean
}

type Permissions = {
  superAdmin: boolean
  restrictedAdmin: boolean
  client: boolean
  allowedUserIds: string[]
}

type HermesProfile = {
  orgId: string
  profile: string
  baseUrl: string
  dashboardBaseUrl?: string
  enabled: boolean
  capabilities: Capabilities
  permissions: Permissions
  hasApiKey: boolean
  hasDashboardSessionToken?: boolean
}

type ProfileForm = {
  profile: string
  baseUrl: string
  apiKey: string
  dashboardBaseUrl: string
  dashboardSessionToken: string
  enabled: boolean
  capabilities: Capabilities
  permissions: Permissions
}

type Organization = { id: string; name: string; slug: string }
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
type RunEvent = { event?: string; timestamp?: number; tool?: string; preview?: string; [key: string]: unknown }
type JobSummary = { id?: string; job_id?: string; name?: string; prompt?: string; schedule?: string; enabled?: boolean; status?: string; [key: string]: unknown }

const methods: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
const terminalStatuses = new Set(['completed', 'failed', 'cancelled', 'canceled', 'stopped'])

const defaultCapabilities: Capabilities = {
  runs: true,
  dashboard: true,
  cron: true,
  models: true,
  tools: true,
  files: true,
  terminal: true,
}

const defaultPermissions: Permissions = {
  superAdmin: true,
  restrictedAdmin: true,
  client: false,
  allowedUserIds: [],
}

function defaultForm(): ProfileForm {
  return {
    profile: '',
    baseUrl: '',
    apiKey: '',
    dashboardBaseUrl: '',
    dashboardSessionToken: '',
    enabled: true,
    capabilities: { ...defaultCapabilities },
    permissions: { ...defaultPermissions, allowedUserIds: [] },
  }
}

function Toggle({ label, checked, onChange, help }: { label: string; checked: boolean; onChange: (v: boolean) => void; help?: string }) {
  return (
    <label className="flex items-start justify-between gap-4 rounded-lg border border-[var(--color-card-border)] bg-[var(--color-card)] p-3">
      <span>
        <span className="block text-sm font-medium text-on-surface">{label}</span>
        {help && <span className="block text-xs text-on-surface-variant mt-0.5">{help}</span>}
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1 h-4 w-4" />
    </label>
  )
}

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="max-h-96 overflow-auto rounded-lg bg-black/80 p-4 text-xs text-green-100 whitespace-pre-wrap">
      {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
    </pre>
  )
}

function parseJsonText(text: string) {
  if (!text.trim()) return undefined
  return JSON.parse(text)
}

function runIdFromPayload(data: unknown) {
  const payload = data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
  return String(payload.run_id ?? payload.runId ?? payload.id ?? '')
}

function jobsFromPayload(data: unknown): JobSummary[] {
  if (Array.isArray(data)) return data as JobSummary[]
  if (data && typeof data === 'object') {
    const payload = data as Record<string, unknown>
    if (Array.isArray(payload.jobs)) return payload.jobs as JobSummary[]
    if (Array.isArray(payload.data)) return payload.data as JobSummary[]
    if (Array.isArray(payload.items)) return payload.items as JobSummary[]
  }
  return []
}

function jobId(job: JobSummary) {
  return String(job.id ?? job.job_id ?? '')
}

export default function AgentPage() {
  const params = useParams()
  const slug = params.slug as string

  const [org, setOrg] = useState<Organization | null>(null)
  const [profile, setProfile] = useState<HermesProfile | null>(null)
  const [form, setForm] = useState<ProfileForm>(() => defaultForm())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const [taskPrompt, setTaskPrompt] = useState('')
  const [runResult, setRunResult] = useState<unknown>(null)
  const [runId, setRunId] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [events, setEvents] = useState<RunEvent[]>([])
  const [approvalPending, setApprovalPending] = useState(false)
  const eventSourceRef = useRef<EventSource | null>(null)

  const [jobs, setJobs] = useState<JobSummary[]>([])
  const [jobsLoading, setJobsLoading] = useState(false)
  const [jobName, setJobName] = useState('')
  const [jobSchedule, setJobSchedule] = useState('every day 9am')
  const [jobPrompt, setJobPrompt] = useState('')
  const [jobResult, setJobResult] = useState<unknown>(null)

  const [control, setControl] = useState('models')
  const [controlPath, setControlPath] = useState('')
  const [controlMethod, setControlMethod] = useState<HttpMethod>('GET')
  const [controlBody, setControlBody] = useState('')
  const [controlResult, setControlResult] = useState<unknown>(null)
  const [controlLoading, setControlLoading] = useState(false)

  const apiBase = useMemo(() => (org ? `/api/v1/admin/hermes/profiles/${encodeURIComponent(org.id)}` : ''), [org])

  useEffect(() => {
    async function load() {
      try {
        setLoading(true)
        setError(null)
        const orgsRes = await fetch('/api/v1/organizations')
        const orgsBody = await orgsRes.json()
        if (!orgsRes.ok) throw new Error(orgsBody.error || 'Failed to load organizations')
        const found = (orgsBody.data ?? []).find((o: Organization) => o.slug === slug)
        if (!found) throw new Error('Organization not found')
        setOrg(found)

        const profileRes = await fetch(`/api/v1/admin/hermes/profiles/${encodeURIComponent(found.id)}`)
        const profileBody = await profileRes.json()
        if (profileRes.status === 404) return
        if (!profileRes.ok) throw new Error(profileBody.error || 'Failed to load Hermes profile')
        const p = profileBody.data as HermesProfile
        setProfile(p)
        setForm({
          profile: p.profile,
          baseUrl: p.baseUrl,
          apiKey: '',
          dashboardBaseUrl: p.dashboardBaseUrl ?? '',
          dashboardSessionToken: '',
          enabled: p.enabled,
          capabilities: { ...defaultCapabilities, ...p.capabilities },
          permissions: { ...defaultPermissions, ...p.permissions, allowedUserIds: p.permissions?.allowedUserIds ?? [] },
        })
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load agent control plane')
      } finally {
        setLoading(false)
      }
    }
    if (slug) void load()
  }, [slug])

  useEffect(() => {
    if (!apiBase || !runId) return undefined

    let stopped = false
    const poll = async () => {
      try {
        const res = await fetch(`${apiBase}/runs/${encodeURIComponent(runId)}`)
        const body = await res.json()
        if (!res.ok) throw new Error(body.error || 'Failed to poll run status')
        const nextStatus = String(body.status ?? body.data?.status ?? '')
        if (nextStatus) setStatus(nextStatus)
        if (terminalStatuses.has(nextStatus)) {
          stopped = true
          eventSourceRef.current?.close()
          eventSourceRef.current = null
        }
      } catch (e) {
        console.error('Hermes run polling failed', e)
      }
    }

    const es = new EventSource(`${apiBase}/runs/${encodeURIComponent(runId)}/events`)
    eventSourceRef.current = es
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as RunEvent
        setEvents((prev) => [...prev, data])
        if (data.event === 'approval.request') setApprovalPending(true)
        if (data.event === 'approval.responded' || data.event === 'approval.resolved') setApprovalPending(false)
      } catch (e) {
        console.error('Failed to parse Hermes SSE event', e)
      }
    }
    es.onerror = () => es.close()

    void poll()
    const interval = window.setInterval(() => {
      if (!stopped) void poll()
    }, 2000)

    return () => {
      stopped = true
      window.clearInterval(interval)
      es.close()
      if (eventSourceRef.current === es) eventSourceRef.current = null
    }
  }, [apiBase, runId])

  const setCapability = (key: keyof Capabilities, value: boolean) => {
    setForm((f) => ({ ...f, capabilities: { ...f.capabilities, [key]: value } }))
  }

  const setPermission = (key: keyof Permissions, value: boolean | string[]) => {
    setForm((f) => ({ ...f, permissions: { ...f.permissions, [key]: value } }))
  }

  async function saveProfile(e: FormEvent) {
    e.preventDefault()
    if (!apiBase) return
    try {
      setSaving(true)
      setError(null)
      setMessage(null)
      const res = await fetch(apiBase, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Failed to save Hermes profile')
      setProfile(body.data)
      setForm((f) => ({ ...f, apiKey: '', dashboardSessionToken: '' }))
      setMessage('Hermes profile link saved.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save Hermes profile')
    } finally {
      setSaving(false)
    }
  }

  async function runTask(e: FormEvent) {
    e.preventDefault()
    if (!apiBase || !taskPrompt.trim()) return
    try {
      setRunning(true)
      setError(null)
      setRunResult(null)
      setRunId(null)
      setStatus(null)
      setEvents([])
      setApprovalPending(false)
      eventSourceRef.current?.close()
      eventSourceRef.current = null

      const res = await fetch(`${apiBase}/runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: taskPrompt }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Hermes run failed')
      const dataPayload = (body.data ?? body) as Record<string, unknown>
      const hermesPayload = (dataPayload.hermes ?? dataPayload) as Record<string, unknown>
      const newRunId = runIdFromPayload(hermesPayload)
      if (!newRunId) throw new Error('No run ID returned from Hermes')
      setRunResult(dataPayload)
      setStatus(String(hermesPayload.status ?? 'submitted'))
      setRunId(newRunId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Hermes run failed')
    } finally {
      setRunning(false)
    }
  }

  async function stopRun() {
    if (!apiBase || !runId) return
    try {
      const res = await fetch(`${apiBase}/runs/${encodeURIComponent(runId)}/stop`, { method: 'POST' })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Failed to stop run')
      setStatus(String(body.status ?? body.data?.status ?? 'stopping'))
      setRunResult(body)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to stop run')
    }
  }

  async function handleApproval(choice: 'once' | 'session' | 'always' | 'deny') {
    if (!apiBase || !runId) return
    try {
      const res = await fetch(`${apiBase}/runs/${encodeURIComponent(runId)}/approval`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ choice }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Approval failed')
      setApprovalPending(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approval failed')
    }
  }

  async function loadJobs() {
    if (!apiBase) return
    try {
      setJobsLoading(true)
      setError(null)
      const res = await fetch(`${apiBase}/jobs`)
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Failed to load Hermes jobs')
      setJobs(jobsFromPayload(body.data ?? body))
      setJobResult(body.data ?? body)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load Hermes jobs')
    } finally {
      setJobsLoading(false)
    }
  }

  async function createJob(e: FormEvent) {
    e.preventDefault()
    if (!apiBase || !jobPrompt.trim() || !jobSchedule.trim()) return
    try {
      setJobsLoading(true)
      setError(null)
      const res = await fetch(`${apiBase}/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: jobName || undefined, prompt: jobPrompt, schedule: jobSchedule }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Failed to create Hermes job')
      setJobResult(body.data ?? body)
      setJobPrompt('')
      setJobName('')
      await loadJobs()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create Hermes job')
    } finally {
      setJobsLoading(false)
    }
  }

  async function jobAction(id: string, action: 'pause' | 'resume' | 'run' | 'delete') {
    if (!apiBase || !id) return
    try {
      setJobsLoading(true)
      setError(null)
      const res = await fetch(`${apiBase}/jobs/${encodeURIComponent(id)}${action === 'delete' ? '' : `/${action}`}`, {
        method: action === 'delete' ? 'DELETE' : 'POST',
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || `Failed to ${action} Hermes job`)
      setJobResult(body.data ?? body)
      await loadJobs()
    } catch (e) {
      setError(e instanceof Error ? e.message : `Failed to ${action} Hermes job`)
    } finally {
      setJobsLoading(false)
    }
  }

  async function callControl(e: FormEvent) {
    e.preventDefault()
    if (!apiBase || !control.trim()) return
    try {
      setControlLoading(true)
      setError(null)
      const cleanPath = controlPath.trim().replace(/^\/+/, '')
      const init: RequestInit = { method: controlMethod }
      if (controlMethod !== 'GET' && controlMethod !== 'DELETE' && controlBody.trim()) {
        init.headers = { 'Content-Type': 'application/json' }
        init.body = JSON.stringify(parseJsonText(controlBody))
      }
      const res = await fetch(`${apiBase}/controls/${encodeURIComponent(control)}${cleanPath ? `/${cleanPath}` : ''}`, init)
      const text = await res.text()
      let data: unknown = text
      try { data = JSON.parse(text) } catch {}
      if (!res.ok) {
        const msg = typeof data === 'object' && data && 'error' in data ? String((data as { error?: unknown }).error) : 'Hermes control request failed'
        throw new Error(msg)
      }
      setControlResult(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Hermes control request failed')
    } finally {
      setControlLoading(false)
    }
  }

  if (loading) return <div className="max-w-6xl mx-auto"><div className="pib-card">Loading agent control plane...</div></div>

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-headline font-bold text-on-surface">Hermes Agent</h1>
          <p className="text-sm text-on-surface-variant mt-1">{org?.name ?? slug} profile control plane</p>
        </div>
        <div className="text-right text-xs text-on-surface-variant">
          <div>Profile: {profile?.profile || 'not linked'}</div>
          <div>Status: {profile?.enabled ? 'enabled' : 'disabled'}</div>
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}
      {message && <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-300">{message}</div>}

      <div className="grid gap-6 lg:grid-cols-2">
        <form onSubmit={saveProfile} className="pib-card space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-on-surface">Profile link</h2>
            <p className="text-xs text-on-surface-variant mt-1">Server-side profile mapping. Secrets are never returned to the browser. API server handles runs/jobs; dashboard URL+token handles model/config/tools/logs controls.</p>
          </div>
          <input className="w-full rounded-lg border border-[var(--color-card-border)] bg-[var(--color-card)] px-3 py-2 text-sm" placeholder="Hermes profile name" value={form.profile} onChange={(e) => setForm({ ...form, profile: e.target.value })} />
          <input className="w-full rounded-lg border border-[var(--color-card-border)] bg-[var(--color-card)] px-3 py-2 text-sm" placeholder="API server URL, e.g. http://127.0.0.1:8651" value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} />
          <input className="w-full rounded-lg border border-[var(--color-card-border)] bg-[var(--color-card)] px-3 py-2 text-sm" placeholder={profile?.hasApiKey ? 'API key saved — leave blank to keep it' : 'Hermes API key'} value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} />
          <input className="w-full rounded-lg border border-[var(--color-card-border)] bg-[var(--color-card)] px-3 py-2 text-sm" placeholder="Dashboard URL, e.g. http://127.0.0.1:9119 (optional; needed for config/tools/sessions/logs)" value={form.dashboardBaseUrl} onChange={(e) => setForm({ ...form, dashboardBaseUrl: e.target.value })} />
          <input className="w-full rounded-lg border border-[var(--color-card-border)] bg-[var(--color-card)] px-3 py-2 text-sm" placeholder={profile?.hasDashboardSessionToken ? 'Dashboard session token saved — leave blank to keep it' : 'Dashboard session token (X-Hermes-Session-Token)'} value={form.dashboardSessionToken} onChange={(e) => setForm({ ...form, dashboardSessionToken: e.target.value })} />
          <Toggle label="Profile enabled" checked={form.enabled} onChange={(v) => setForm({ ...form, enabled: v })} />
          <button disabled={saving} className="pib-btn-primary text-sm font-label">{saving ? 'Saving...' : 'Save profile link'}</button>
        </form>

        <form onSubmit={runTask} className="pib-card space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-on-surface">Task runner</h2>
            <p className="text-xs text-on-surface-variant mt-1">Send a task to this client’s isolated Hermes profile with live status, SSE events, approval, and stop controls.</p>
          </div>
          <textarea className="min-h-36 w-full rounded-lg border border-[var(--color-card-border)] bg-[var(--color-card)] px-3 py-2 text-sm" placeholder="Ask this profile to do work for the selected client..." value={taskPrompt} onChange={(e) => setTaskPrompt(e.target.value)} />
          <button disabled={running || !profile?.enabled} className="pib-btn-primary text-sm font-label">{running ? 'Submitting...' : 'Send task to Hermes'}</button>
          {runResult !== null && <JsonBlock value={runResult} />}
        </form>
      </div>

      {runId && (
        <section className="pib-card space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-on-surface">Run status</h2>
              <p className="text-xs text-on-surface-variant mt-1 break-all">{runId}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="rounded-full border border-[var(--color-card-border)] px-3 py-1 text-xs text-on-surface">{status ?? 'unknown'}</span>
              <button type="button" onClick={stopRun} className="pib-btn-secondary text-xs font-label px-3 py-1">Stop</button>
            </div>
          </div>
          {approvalPending && (
            <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3">
              <p className="text-sm font-medium text-on-surface">Waiting for approval</p>
              <div className="flex flex-wrap gap-2 mt-2">
                {(['once', 'session', 'always', 'deny'] as const).map((choice) => (
                  <button type="button" key={choice} onClick={() => handleApproval(choice)} className="pib-btn-secondary text-xs font-label px-3 py-1">{choice}</button>
                ))}
              </div>
            </div>
          )}
          <div className="max-h-64 overflow-auto rounded-lg border border-[var(--color-card-border)] bg-[var(--color-card)] p-2 text-xs">
            {events.length === 0 ? <p className="text-on-surface-variant">No events yet.</p> : events.map((event, index) => (
              <div key={`${event.event ?? 'event'}-${index}`} className="mb-2 last:mb-0">
                <div className="font-mono text-on-surface">{event.event ?? 'event'} {event.tool ? `(${event.tool})` : ''}</div>
                {event.preview && <div className="mt-1 whitespace-pre-wrap text-on-surface-variant">{event.preview}</div>}
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="pib-card space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-on-surface">Capability switches</h2>
            <p className="text-xs text-on-surface-variant mt-1">Per-profile safety switches.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {(Object.keys(defaultCapabilities) as (keyof Capabilities)[]).map((key) => (
              <Toggle key={key} label={key} checked={form.capabilities[key]} onChange={(v) => setCapability(key, v)} />
            ))}
          </div>
        </section>

        <section className="pib-card space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-on-surface">Permission switches</h2>
            <p className="text-xs text-on-surface-variant mt-1">Restricted admins still require org assignment.</p>
          </div>
          <Toggle label="Super-admin access" checked={form.permissions.superAdmin} onChange={(v) => setPermission('superAdmin', v)} />
          <Toggle label="Restricted admin access" checked={form.permissions.restrictedAdmin} onChange={(v) => setPermission('restrictedAdmin', v)} />
          <Toggle label="Client access" checked={form.permissions.client} onChange={(v) => setPermission('client', v)} />
          <textarea className="min-h-20 w-full rounded-lg border border-[var(--color-card-border)] bg-[var(--color-card)] px-3 py-2 text-sm" placeholder="Explicit allowed user IDs, one per line" value={form.permissions.allowedUserIds.join('\n')} onChange={(e) => setPermission('allowedUserIds', e.target.value.split('\n').map((v) => v.trim()).filter(Boolean))} />
        </section>
      </div>

      <section className="pib-card space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-on-surface">Cron jobs</h2>
            <p className="text-xs text-on-surface-variant mt-1">List, create, pause, resume, trigger, and delete scheduled jobs for this profile.</p>
          </div>
          <button type="button" onClick={loadJobs} disabled={jobsLoading || !profile?.enabled} className="pib-btn-secondary text-xs font-label px-3 py-1">Refresh jobs</button>
        </div>
        <form onSubmit={createJob} className="grid gap-3 md:grid-cols-[1fr_180px]">
          <input className="rounded-lg border border-[var(--color-card-border)] bg-[var(--color-card)] px-3 py-2 text-sm" placeholder="Job name" value={jobName} onChange={(e) => setJobName(e.target.value)} />
          <input className="rounded-lg border border-[var(--color-card-border)] bg-[var(--color-card)] px-3 py-2 text-sm" placeholder="Schedule" value={jobSchedule} onChange={(e) => setJobSchedule(e.target.value)} />
          <textarea className="min-h-24 rounded-lg border border-[var(--color-card-border)] bg-[var(--color-card)] px-3 py-2 text-sm md:col-span-2" placeholder="Job prompt" value={jobPrompt} onChange={(e) => setJobPrompt(e.target.value)} />
          <button disabled={jobsLoading || !profile?.enabled} className="pib-btn-primary text-sm font-label md:col-span-2">Create job</button>
        </form>
        <div className="space-y-2">
          {jobs.length === 0 ? <p className="text-sm text-on-surface-variant">No jobs loaded yet.</p> : jobs.map((job, index) => {
            const id = jobId(job)
            return (
              <div key={id || index} className="rounded-lg border border-[var(--color-card-border)] bg-[var(--color-card)] p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-on-surface">{job.name ?? (id || 'Untitled job')}</div>
                    <div className="text-xs text-on-surface-variant">{job.schedule ?? job.status ?? ''}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(['run', 'pause', 'resume', 'delete'] as const).map((action) => (
                      <button type="button" key={action} onClick={() => jobAction(id, action)} disabled={!id || jobsLoading} className="pib-btn-secondary text-xs font-label px-3 py-1">{action}</button>
                    ))}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        {jobResult !== null && <JsonBlock value={jobResult} />}
      </section>

      <form onSubmit={callControl} className="pib-card space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-on-surface">Admin controls</h2>
          <p className="text-xs text-on-surface-variant mt-1">Allowlisted proxy for dashboard-equivalent controls: models, model, config, tools, skills, sessions, logs, env, profile, profiles, and cron.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-[160px_140px_1fr]">
          <select className="rounded-lg border border-[var(--color-card-border)] bg-[var(--color-card)] px-3 py-2 text-sm" value={control} onChange={(e) => setControl(e.target.value)}>
            {['models', 'model', 'config', 'tools', 'skills', 'sessions', 'logs', 'env', 'profile', 'profiles', 'cron'].map((item) => <option key={item}>{item}</option>)}
          </select>
          <select className="rounded-lg border border-[var(--color-card-border)] bg-[var(--color-card)] px-3 py-2 text-sm" value={controlMethod} onChange={(e) => setControlMethod(e.target.value as HttpMethod)}>
            {methods.map((m) => <option key={m}>{m}</option>)}
          </select>
          <input className="rounded-lg border border-[var(--color-card-border)] bg-[var(--color-card)] px-3 py-2 text-sm" value={controlPath} onChange={(e) => setControlPath(e.target.value)} placeholder="optional subpath, e.g. options" />
        </div>
        {controlMethod !== 'GET' && controlMethod !== 'DELETE' && (
          <textarea className="min-h-32 w-full rounded-lg border border-[var(--color-card-border)] bg-[var(--color-card)] px-3 py-2 text-sm font-mono" value={controlBody} onChange={(e) => setControlBody(e.target.value)} placeholder='{"provider":"openrouter","model":"anthropic/claude-sonnet-4"}' />
        )}
        <div className="flex flex-wrap gap-2 text-xs">
          {[
            ['models', 'GET', ''],
            ['model', 'GET', 'options'],
            ['config', 'GET', ''],
            ['tools', 'GET', 'toolsets'],
            ['skills', 'GET', ''],
            ['sessions', 'GET', ''],
            ['logs', 'GET', ''],
          ].map(([c, m, p]) => (
            <button type="button" key={`${c}-${p}`} onClick={() => { setControl(c); setControlMethod(m as HttpMethod); setControlPath(p) }} className="pib-btn-secondary !px-3 !py-1">{c}{p ? `/${p}` : ''}</button>
          ))}
        </div>
        <button disabled={controlLoading || !profile?.enabled} className="pib-btn-primary text-sm font-label">{controlLoading ? 'Calling...' : 'Call Hermes control'}</button>
        {controlResult !== null && <JsonBlock value={controlResult} />}
      </form>
    </div>
  )
}
