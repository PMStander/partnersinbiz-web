'use client'

import { useState, useEffect } from 'react'
import { useToast } from '@/components/ui/Toast'
import type { AgentTeamDoc } from './AgentCard'
import type { HealthStatus } from './AgentCard'

const COLOR_ACCENT: Record<string, string> = {
  violet:  'text-violet-400',
  sky:     'text-sky-400',
  amber:   'text-amber-400',
  emerald: 'text-emerald-400',
  rose:    'text-rose-400',
}

const COLOR_ICON_BG: Record<string, string> = {
  violet:  'bg-violet-500/15 text-violet-400',
  sky:     'bg-sky-500/15 text-sky-400',
  amber:   'bg-amber-500/15 text-amber-400',
  emerald: 'bg-emerald-500/15 text-emerald-400',
  rose:    'bg-rose-500/15 text-rose-400',
}

const HEALTH_PILL: Record<HealthStatus, { label: string; className: string }> = {
  ok:          { label: 'Online',      className: 'bg-emerald-500/15 text-emerald-400' },
  degraded:    { label: 'Degraded',    className: 'bg-amber-500/15 text-amber-400' },
  unreachable: { label: 'Unreachable', className: 'bg-red-500/15 text-red-400' },
  loading:     { label: 'Checking…',   className: 'bg-white/10 text-on-surface-variant' },
}

interface AgentDetailPanelProps {
  agent: AgentTeamDoc | null
  onClose: () => void
  onSaved: (updated: AgentTeamDoc) => void
}

interface HealthResult {
  status: HealthStatus
  latencyMs?: number
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">
        {label}
      </span>
      {children}
    </div>
  )
}

export function AgentDetailPanel({ agent, onClose, onSaved }: AgentDetailPanelProps) {
  const { success: toastSuccess, error: toastError } = useToast()

  // Edit form state
  const [editName, setEditName]             = useState('')
  const [editPersona, setEditPersona]       = useState('')
  const [editEnabled, setEditEnabled]       = useState(true)
  const [editBaseUrl, setEditBaseUrl]       = useState('')
  const [editApiKey, setEditApiKey]         = useState('')
  const [editModel, setEditModel]           = useState('')

  // Health check state
  const [healthResult, setHealthResult]     = useState<HealthResult | null>(null)
  const [pinging, setPinging]               = useState(false)

  // Save state
  const [saving, setSaving]                 = useState(false)

  // Sync form fields when agent changes
  useEffect(() => {
    if (!agent) return
    setEditName(agent.name)
    setEditPersona(agent.persona)
    setEditEnabled(agent.enabled)
    setEditBaseUrl(agent.baseUrl)
    setEditApiKey('')        // always start blank — placeholder shows masked key
    setEditModel(agent.defaultModel)
    setHealthResult(null)
  }, [agent?.agentId])

  if (!agent) return null

  const { agentId }  = agent
  const iconClass    = COLOR_ICON_BG[agent.colorKey] ?? 'bg-white/10 text-on-surface-variant'
  const accentClass  = COLOR_ACCENT[agent.colorKey] ?? 'text-on-surface-variant'

  async function pingHealth() {
    setPinging(true)
    setHealthResult(null)
    try {
      const res  = await fetch(`/api/v1/admin/agents/${agentId}/health`)
      const body = await res.json()
      if (!res.ok) {
        setHealthResult({ status: 'unreachable' })
      } else {
        setHealthResult({
          status:    body.data?.status ?? 'unreachable',
          latencyMs: body.data?.latencyMs,
        })
      }
    } catch {
      setHealthResult({ status: 'unreachable' })
    } finally {
      setPinging(false)
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        name:         editName.trim(),
        persona:      editPersona.trim(),
        enabled:      editEnabled,
        baseUrl:      editBaseUrl.trim(),
        defaultModel: editModel.trim(),
      }
      // Only send apiKey if user typed a new value
      if (editApiKey.trim()) {
        payload.apiKey = editApiKey.trim()
      }

      const res  = await fetch(`/api/v1/admin/agents/${agentId}`, {
        method:  'PUT',
        headers: { 'content-type': 'application/json' },
        body:    JSON.stringify(payload),
      })
      const body = await res.json()
      if (!res.ok) {
        toastError(body?.error ?? 'Failed to save agent')
      } else {
        toastSuccess(`${editName} saved.`)
        onSaved(body.data as AgentTeamDoc)
        setEditApiKey('')
      }
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const healthPill = healthResult ? HEALTH_PILL[healthResult.status] : null

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Panel header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-white/10 shrink-0">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${iconClass}`}>
          <span className="material-symbols-outlined text-[22px]">{agent.iconKey}</span>
        </div>
        <div className="flex-1 min-w-0">
          <h2 className={`text-base font-semibold ${accentClass}`}>{agent.name}</h2>
          <p className="text-xs text-on-surface-variant leading-snug">{agent.role}</p>
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 text-on-surface-variant hover:text-on-surface transition-colors"
          aria-label="Close panel"
        >
          <span className="material-symbols-outlined text-[20px]">close</span>
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

        {/* Read-only summary */}
        <section className="space-y-3">
          <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">
            Overview
          </p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="pib-card p-3 space-y-0.5">
              <p className="text-[10px] font-label uppercase tracking-wide text-on-surface-variant">Status</p>
              <div className="flex items-center gap-1.5 mt-1">
                <span className={`w-1.5 h-1.5 rounded-full ${agent.enabled ? 'bg-emerald-400' : 'bg-white/20'}`} />
                <span className="text-sm text-on-surface">{agent.enabled ? 'Enabled' : 'Disabled'}</span>
              </div>
            </div>
            <div className="pib-card p-3 space-y-0.5">
              <p className="text-[10px] font-label uppercase tracking-wide text-on-surface-variant">Last health</p>
              {agent.lastHealthStatus ? (
                <span className={`inline-block mt-1 text-[10px] font-label uppercase tracking-wide px-2 py-0.5 rounded-full ${HEALTH_PILL[agent.lastHealthStatus].className}`}>
                  {HEALTH_PILL[agent.lastHealthStatus].label}
                </span>
              ) : (
                <span className="text-xs text-on-surface-variant/50 mt-1 block">No data</span>
              )}
            </div>
          </div>

          {/* API key masked */}
          <div className="pib-card p-3">
            <p className="text-[10px] font-label uppercase tracking-wide text-on-surface-variant mb-1">API Key (masked)</p>
            <code className="text-xs font-mono text-on-surface-variant/70 break-all">{agent.apiKey}</code>
          </div>

          {/* Base URL */}
          <div className="pib-card p-3">
            <p className="text-[10px] font-label uppercase tracking-wide text-on-surface-variant mb-1">Base URL</p>
            <code className="text-xs font-mono text-on-surface break-all">{agent.baseUrl}</code>
          </div>
        </section>

        {/* Health ping */}
        <section className="space-y-3">
          <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">
            Health Check
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={pingHealth}
              disabled={pinging}
              className="pib-btn-ghost text-sm font-label flex items-center gap-1.5 disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[16px]">wifi_tethering</span>
              {pinging ? 'Pinging…' : 'Ping now'}
            </button>
            {healthPill && !pinging && (
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-label uppercase tracking-wide px-2 py-0.5 rounded-full ${healthPill.className}`}>
                  {healthPill.label}
                </span>
                {healthResult?.latencyMs !== undefined && (
                  <span className="text-xs text-on-surface-variant">{healthResult.latencyMs}ms</span>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Edit form */}
        <form id="agent-edit-form" onSubmit={handleSave} className="space-y-4">
          <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">
            Edit
          </p>

          <FieldRow label="Name">
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="pib-input w-full"
              required
            />
          </FieldRow>

          <FieldRow label="Persona">
            <textarea
              value={editPersona}
              onChange={(e) => setEditPersona(e.target.value)}
              className="pib-input w-full resize-none"
              rows={4}
            />
          </FieldRow>

          <FieldRow label="Default Model">
            <input
              type="text"
              value={editModel}
              onChange={(e) => setEditModel(e.target.value)}
              className="pib-input w-full font-mono text-sm"
              placeholder="e.g. claude-sonnet-4-6"
            />
          </FieldRow>

          <FieldRow label="Base URL">
            <input
              type="url"
              value={editBaseUrl}
              onChange={(e) => setEditBaseUrl(e.target.value)}
              className="pib-input w-full font-mono text-sm"
              placeholder="https://…"
            />
          </FieldRow>

          <FieldRow label="API Key (leave blank to keep current)">
            <input
              type="password"
              value={editApiKey}
              onChange={(e) => setEditApiKey(e.target.value)}
              className="pib-input w-full font-mono text-sm"
              placeholder={agent.apiKey}
              autoComplete="new-password"
            />
          </FieldRow>

          <label className="flex items-center gap-3 cursor-pointer group select-none">
            <div
              onClick={() => setEditEnabled((v) => !v)}
              className={`relative w-10 h-6 rounded-full transition-colors duration-150 ${editEnabled ? 'bg-emerald-500' : 'bg-white/20'}`}
            >
              <span
                className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform duration-150 ${editEnabled ? 'translate-x-4' : 'translate-x-0'}`}
              />
            </div>
            <span className="text-sm text-on-surface group-hover:text-on-surface">
              Agent enabled
            </span>
          </label>
        </form>
      </div>

      {/* Sticky footer */}
      <div className="shrink-0 px-6 py-4 border-t border-white/10 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="pib-btn-ghost text-sm font-label"
          disabled={saving}
        >
          Cancel
        </button>
        <button
          type="submit"
          form="agent-edit-form"
          className="pib-btn-primary text-sm font-label"
          disabled={saving}
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  )
}
