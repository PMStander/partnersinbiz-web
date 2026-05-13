'use client'

import { useEffect, useState, useCallback } from 'react'
import { AgentCard } from '@/components/agents/AgentCard'
import { AgentDetailPanel } from '@/components/agents/AgentDetailPanel'
import type { AgentTeamDoc } from '@/components/agents/AgentCard'
import type { HealthStatus } from '@/components/agents/AgentCard'

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`pib-skeleton ${className}`} />
}

export default function AgentsBoardClient() {
  const [agents, setAgents]           = useState<AgentTeamDoc[]>([])
  const [loading, setLoading]         = useState(true)
  const [topError, setTopError]       = useState<string | null>(null)
  const [healthMap, setHealthMap]     = useState<Record<string, HealthStatus>>({})
  const [selected, setSelected]       = useState<AgentTeamDoc | null>(null)
  const [panelOpen, setPanelOpen]     = useState(false)

  async function loadAgents() {
    setLoading(true)
    setTopError(null)
    try {
      const res  = await fetch('/api/v1/admin/agents')
      const body = await res.json()
      if (!res.ok) {
        setTopError(body?.error ?? 'Failed to load agents')
        return
      }
      const data: AgentTeamDoc[] = body.data ?? []
      setAgents(data)
      pingAllHealth(data)
    } catch (err) {
      setTopError(err instanceof Error ? err.message : 'Failed to load agents')
    } finally {
      setLoading(false)
    }
  }

  const pingAllHealth = useCallback(async (agentList: AgentTeamDoc[]) => {
    // Set all to loading first
    setHealthMap(Object.fromEntries(agentList.map((a) => [a.agentId, 'loading' as HealthStatus])))

    // Ping in parallel — update map as each resolves
    await Promise.allSettled(
      agentList.map(async (agent) => {
        try {
          const res  = await fetch(`/api/v1/admin/agents/${agent.agentId}/health`)
          const body = await res.json()
          const status: HealthStatus = res.ok
            ? (body.data?.status as HealthStatus) ?? 'unreachable'
            : 'unreachable'
          setHealthMap((prev) => ({ ...prev, [agent.agentId]: status }))
        } catch {
          setHealthMap((prev) => ({ ...prev, [agent.agentId]: 'unreachable' }))
        }
      }),
    )
  }, [])

  useEffect(() => {
    loadAgents()
  }, [])

  function openPanel(agent: AgentTeamDoc) {
    setSelected(agent)
    setPanelOpen(true)
  }

  function closePanel() {
    setPanelOpen(false)
    // Delay clearing selected so exit animation can finish
    setTimeout(() => setSelected(null), 300)
  }

  function handleSaved(updated: AgentTeamDoc) {
    setAgents((prev) => prev.map((a) => (a.agentId === updated.agentId ? updated : a)))
    setSelected(updated)
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant mb-1">
            Platform
          </p>
          <h1 className="text-2xl font-headline font-bold text-on-surface">Agent Team</h1>
          <p className="text-sm text-on-surface-variant mt-1">
            Manage the 5 specialist agents that serve your clients.
          </p>
        </div>
        <button
          onClick={() => loadAgents()}
          className="pib-btn-ghost text-sm font-label flex items-center gap-1.5 shrink-0"
          title="Refresh"
        >
          <span className="material-symbols-outlined text-[16px]">refresh</span>
          Refresh
        </button>
      </div>

      {topError && (
        <div className="pib-card border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-400">
          {topError}
        </div>
      )}

      {/* Agent grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-44 rounded-xl" />
          ))}
        </div>
      ) : agents.length === 0 ? (
        <div className="pib-card p-10 text-center text-sm text-on-surface-variant">
          No agents found. The agent team API may be unavailable.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map((agent) => (
            <AgentCard
              key={agent.agentId}
              agent={agent}
              onClick={() => openPanel(agent)}
              healthStatus={healthMap[agent.agentId] ?? 'loading'}
            />
          ))}
        </div>
      )}

      {/* Slide-over overlay */}
      {panelOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            onClick={closePanel}
            aria-hidden
          />

          {/* Panel */}
          <div
            className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-[var(--color-pib-bg)] border-l border-white/10 shadow-2xl flex flex-col"
            style={{ animation: 'slideIn 0.2s ease-out' }}
          >
            <AgentDetailPanel
              agent={selected}
              onClose={closePanel}
              onSaved={handleSaved}
            />
          </div>
        </>
      )}

    </div>
  )
}
