'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { AnalyticsNav } from '@/components/admin/AnalyticsNav'

interface LiveEvent {
  id: string
  event: string
  distinctId: string
  country: string | null
  device: string | null
  pageUrl: string | null
  properties: Record<string, unknown>
  serverTime: unknown
}

const EVENT_COLORS: Record<string, string> = {
  '$pageview': 'text-blue-400',
  '$identify': 'text-purple-400',
  'signup': 'text-green-400',
  'signup_completed': 'text-green-400',
}
const defaultColor = 'text-amber-400'

export default function LivePage() {
  const sp = useSearchParams()
  const initialPid = sp?.get('propertyId') ?? ''
  const [propertyId, setPropertyId] = useState(initialPid)
  const [active, setActive] = useState(false)
  const [events, setEvents] = useState<LiveEvent[]>([])
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  async function poll(pid: string) {
    const res = await fetch(`/api/v1/analytics/live?propertyId=${encodeURIComponent(pid)}`)
    if (!res.ok) return
    const data = await res.json()
    setEvents(data.events ?? [])
  }

  function start() {
    if (!propertyId) return
    setActive(true)
    poll(propertyId)
    intervalRef.current = setInterval(() => poll(propertyId), 5000)
  }

  function stop() {
    setActive(false)
    if (intervalRef.current) clearInterval(intervalRef.current)
  }

  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current) }, [])

  useEffect(() => {
    if (initialPid) {
      setActive(true)
      poll(initialPid)
      intervalRef.current = setInterval(() => poll(initialPid), 5000)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="p-6 space-y-6">
      <AnalyticsNav active="live" />
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-headline font-bold text-on-surface">Live</h1>
        {active && (
          <span className="flex items-center gap-1.5 text-green-400 text-xs font-medium">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            Live — last 5 min
          </span>
        )}
      </div>

      <div className="pib-card p-4 flex gap-3 items-end">
        <div className="flex-1">
          <label className="text-xs font-label uppercase tracking-widest text-on-surface-variant block mb-1">Property ID</label>
          <input className="pib-input w-full" value={propertyId} onChange={e => setPropertyId(e.target.value)}
            placeholder="prop_abc" disabled={active} />
        </div>
        {!active
          ? <button className="pib-btn-primary" onClick={start} disabled={!propertyId}>Start</button>
          : <button className="pib-btn-secondary" onClick={stop}>Stop</button>
        }
      </div>

      {events.length === 0 && active && (
        <p className="text-on-surface-variant text-sm">Waiting for events in the last 5 minutes…</p>
      )}

      {events.length > 0 && (
        <div className="pib-card divide-y divide-[var(--color-card-border)]">
          {events.map((ev, i) => (
            <div key={ev.id ?? i} className="p-3 flex items-start gap-4 text-sm">
              <span className={`font-mono text-xs whitespace-nowrap pt-0.5 ${EVENT_COLORS[ev.event] ?? defaultColor}`}>
                {ev.event}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-on-surface-variant text-xs truncate">
                  {ev.pageUrl ?? (ev.properties?.['$current_url'] as string) ?? '—'}
                </p>
                <p className="text-on-surface-variant text-xs">
                  {ev.distinctId?.slice(0, 12)}… · {ev.device ?? '?'} · {ev.country ?? '?'}
                </p>
              </div>
              <span className="text-on-surface-variant text-xs whitespace-nowrap">
                {(ev.serverTime as any)?._seconds
                  ? new Date((ev.serverTime as any)._seconds * 1000).toLocaleTimeString()
                  : 'now'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
