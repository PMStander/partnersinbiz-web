'use client'
import { useState } from 'react'
import type { AdPixelConfig } from '@/lib/ads/types'

interface Props {
  orgId: string
  orgSlug: string
  initialConfigs: AdPixelConfig[]
}

export function PixelConfigPanel({ orgId, orgSlug: _orgSlug, initialConfigs }: Props) {
  const [configs, setConfigs] = useState(initialConfigs)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  // New config form state
  const [newName, setNewName] = useState('')
  const [newPropertyId, setNewPropertyId] = useState('')
  const [newMetaPixelId, setNewMetaPixelId] = useState('')
  const [newMetaToken, setNewMetaToken] = useState('')

  // Edit form state
  const [editMetaPixelId, setEditMetaPixelId] = useState('')
  const [editMetaToken, setEditMetaToken] = useState('')
  const [editTestCode, setEditTestCode] = useState('')

  // Test event state
  const [testing, setTesting] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<{
    configId: string
    sent: boolean
    metaEventsReceived?: number
    error?: string
  } | null>(null)

  async function createConfig() {
    const res = await fetch('/api/v1/ads/pixel-configs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Org-Id': orgId },
      body: JSON.stringify({
        input: {
          name: newName,
          propertyId: newPropertyId || undefined,
          meta: newMetaPixelId
            ? { pixelId: newMetaPixelId, capiToken: newMetaToken }
            : undefined,
          eventMappings: [],
        },
      }),
    })
    const body = await res.json()
    if (!body.success) { alert(body.error); return }
    setConfigs((c) => [...c, body.data])
    setCreating(false)
    setNewName('')
    setNewPropertyId('')
    setNewMetaPixelId('')
    setNewMetaToken('')
  }

  function startEdit(c: AdPixelConfig) {
    setEditingId(c.id)
    setEditMetaPixelId(c.meta?.pixelId ?? '')
    setEditMetaToken('') // Never display existing token
    setEditTestCode(c.meta?.testEventCode ?? '')
  }

  async function saveEdit(id: string) {
    const patch: Record<string, unknown> = {
      meta: { pixelId: editMetaPixelId, testEventCode: editTestCode || undefined },
    }
    if (editMetaToken) (patch.meta as Record<string, unknown>).capiToken = editMetaToken
    const res = await fetch(`/api/v1/ads/pixel-configs/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Org-Id': orgId },
      body: JSON.stringify(patch),
    })
    const body = await res.json()
    if (!body.success) { alert(body.error); return }
    setConfigs((cs) => cs.map((c) => (c.id === id ? body.data : c)))
    setEditingId(null)
  }

  async function deleteConfig(id: string) {
    if (!confirm('Delete this pixel config?')) return
    const res = await fetch(`/api/v1/ads/pixel-configs/${id}`, {
      method: 'DELETE',
      headers: { 'X-Org-Id': orgId },
    })
    const body = await res.json()
    if (body.success) setConfigs((cs) => cs.filter((c) => c.id !== id))
  }

  async function sendTest(id: string, code: string) {
    setTesting(id)
    setTestResult(null)
    const res = await fetch(`/api/v1/ads/pixel-configs/${id}/test-event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Org-Id': orgId },
      body: JSON.stringify({ testEventCode: code }),
    })
    const body = await res.json()
    setTesting(null)
    setTestResult({
      configId: id,
      ...(body.data ?? { sent: false, error: body.error }),
    })
  }

  return (
    <section className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Pixel &amp; Conversion API</h1>
          <p className="text-sm text-white/60 mt-1">
            Server-side conversion tracking. Configure per Property or org-wide. CAPI tokens
            encrypted at rest.
          </p>
        </div>
        <button className="btn-pib-accent text-sm" onClick={() => setCreating(true)}>
          New pixel config
        </button>
      </header>

      {creating && (
        <div className="rounded border border-white/10 p-4 space-y-3">
          <h2 className="font-medium">New pixel config</h2>
          <input
            className="w-full rounded border border-white/10 bg-white/5 px-3 py-2 text-sm"
            placeholder="Name (e.g. main-pixel)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            aria-label="Config name"
          />
          <input
            className="w-full rounded border border-white/10 bg-white/5 px-3 py-2 text-sm"
            placeholder="Property ID (optional)"
            value={newPropertyId}
            onChange={(e) => setNewPropertyId(e.target.value)}
            aria-label="Property ID"
          />
          <input
            className="w-full rounded border border-white/10 bg-white/5 px-3 py-2 text-sm"
            placeholder="Meta Pixel ID"
            value={newMetaPixelId}
            onChange={(e) => setNewMetaPixelId(e.target.value)}
            aria-label="Meta Pixel ID"
          />
          <input
            className="w-full rounded border border-white/10 bg-white/5 px-3 py-2 text-sm"
            placeholder="Meta CAPI access token (encrypted at rest)"
            type="password"
            value={newMetaToken}
            onChange={(e) => setNewMetaToken(e.target.value)}
            aria-label="Meta CAPI token"
          />
          <div className="flex justify-end gap-2">
            <button className="btn-pib-ghost text-sm" onClick={() => setCreating(false)}>
              Cancel
            </button>
            <button
              className="btn-pib-accent text-sm"
              onClick={createConfig}
              disabled={!newName}
            >
              Create
            </button>
          </div>
        </div>
      )}

      {configs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-white/10 p-8 text-center">
          <p className="text-white/60">No pixel configs yet.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {configs.map((c) => (
            <li key={c.id} className="rounded border border-white/10 p-4">
              {editingId === c.id ? (
                <div className="space-y-3">
                  <div className="font-medium">{c.name}</div>
                  <input
                    className="w-full rounded border border-white/10 bg-white/5 px-3 py-2 text-sm"
                    value={editMetaPixelId}
                    onChange={(e) => setEditMetaPixelId(e.target.value)}
                    placeholder="Meta Pixel ID"
                    aria-label="Edit Meta Pixel ID"
                  />
                  <input
                    className="w-full rounded border border-white/10 bg-white/5 px-3 py-2 text-sm"
                    type="password"
                    value={editMetaToken}
                    onChange={(e) => setEditMetaToken(e.target.value)}
                    placeholder="New Meta CAPI token (leave blank to keep existing)"
                    aria-label="Edit Meta CAPI token"
                  />
                  <input
                    className="w-full rounded border border-white/10 bg-white/5 px-3 py-2 text-sm"
                    value={editTestCode}
                    onChange={(e) => setEditTestCode(e.target.value)}
                    placeholder="Test event code (optional, for staging)"
                    aria-label="Edit test event code"
                  />
                  <div className="flex justify-end gap-2">
                    <button className="btn-pib-ghost text-sm" onClick={() => setEditingId(null)}>
                      Cancel
                    </button>
                    <button className="btn-pib-accent text-sm" onClick={() => saveEdit(c.id)}>
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{c.name}</div>
                      <div className="text-xs text-white/40">
                        {c.propertyId ? `Property: ${c.propertyId}` : 'Org-wide'} &middot; Meta:{' '}
                        {c.meta?.pixelId ?? '—'}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        className="text-xs text-[#F5A623] underline"
                        onClick={() => startEdit(c)}
                      >
                        Edit
                      </button>
                      <button
                        className="text-xs text-red-300 underline"
                        onClick={() => deleteConfig(c.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  {c.meta?.pixelId && (
                    <div className="mt-3 flex items-center gap-2">
                      <input
                        className="flex-1 rounded border border-white/10 bg-white/5 px-2 py-1 text-xs"
                        placeholder="Test event code (from Meta Events Manager)"
                        id={`test-${c.id}`}
                        aria-label="Test event code"
                      />
                      <button
                        className="btn-pib-ghost text-xs"
                        disabled={testing === c.id}
                        onClick={() => {
                          const input = document.getElementById(
                            `test-${c.id}`,
                          ) as HTMLInputElement | null
                          if (input?.value) sendTest(c.id, input.value)
                        }}
                      >
                        {testing === c.id ? 'Sending…' : 'Send test event'}
                      </button>
                    </div>
                  )}
                  {testResult?.configId === c.id && (
                    <div
                      className={`mt-2 rounded px-3 py-2 text-xs ${
                        testResult.sent
                          ? 'bg-emerald-500/10 text-emerald-300'
                          : 'bg-red-500/10 text-red-300'
                      }`}
                    >
                      {testResult.sent
                        ? `✓ Sent ${testResult.metaEventsReceived ?? '?'} event(s) — check Meta Events Manager → Test Events`
                        : `✗ ${testResult.error}`}
                    </div>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
