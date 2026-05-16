'use client'

import type { DocumentBlock } from '@/lib/client-documents/types'
import { BlockFrame } from './BlockFrame'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useEffect, useState } from 'react'
import { chartPalette } from '@/lib/client-documents/chartPalette'

type SeriesPoint = { name: string; value: number }
type RingData = { value: number; max: number; label?: string }
type Content =
  | { kind: 'bar'; title?: string; data: SeriesPoint[]; options?: { horizontal?: boolean } }
  | { kind: 'pie'; title?: string; data: SeriesPoint[]; options?: { donut?: boolean } }
  | { kind: 'line'; title?: string; data: SeriesPoint[] }
  | { kind: 'progress_ring'; title?: string; data: RingData }

export function ChartBlock({ block, index }: { block: DocumentBlock; index: number }) {
  const content = block.content as Content | undefined
  const [accent, setAccent] = useState('#F5A623')

  useEffect(() => {
    if (typeof window === 'undefined') return
    const computed = getComputedStyle(globalThis.document.documentElement)
      .getPropertyValue('--doc-accent')
      .trim()
    if (computed) setAccent(computed)
  }, [])

  if (!content?.kind) return null

  const seriesLength =
    'data' in content && Array.isArray((content as { data: unknown }).data)
      ? (content as { data: SeriesPoint[] }).data.length
      : 5
  const palette = chartPalette(accent, Math.max(seriesLength, 1))

  return (
    <BlockFrame block={block} index={index}>
      {block.title && (
        <h2 className="mb-6 text-2xl font-semibold text-[var(--doc-accent)] md:text-4xl">
          {block.title}
        </h2>
      )}
      <div
        className="h-80 w-full"
        style={{
          background: 'var(--doc-surface)',
          border: '1px solid var(--doc-border)',
          borderRadius: '0.75rem',
          padding: '1rem',
        }}
      >
        {content.kind === 'progress_ring' ? (
          <ProgressRing
            value={content.data.value}
            max={content.data.max}
            label={content.data.label}
            color={accent}
          />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {content.kind === 'bar' ? (
              <BarChart
                data={content.data}
                layout={content.options?.horizontal ? 'vertical' : 'horizontal'}
              >
                <CartesianGrid stroke="var(--doc-border)" strokeDasharray="3 3" />
                <XAxis
                  dataKey={content.options?.horizontal ? 'value' : 'name'}
                  stroke="var(--doc-muted)"
                  fontSize={12}
                  type={content.options?.horizontal ? 'number' : 'category'}
                />
                <YAxis
                  dataKey={content.options?.horizontal ? 'name' : undefined}
                  stroke="var(--doc-muted)"
                  fontSize={12}
                  type={content.options?.horizontal ? 'category' : 'number'}
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--doc-bg)',
                    border: '1px solid var(--doc-border)',
                  }}
                />
                <Bar dataKey="value">
                  {content.data.map((_, i) => (
                    <Cell key={i} fill={palette[i % palette.length]} />
                  ))}
                </Bar>
              </BarChart>
            ) : content.kind === 'pie' ? (
              <PieChart>
                <Pie
                  data={content.data}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={content.options?.donut ? 60 : 0}
                  outerRadius={100}
                >
                  {content.data.map((_, i) => (
                    <Cell key={i} fill={palette[i % palette.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: 'var(--doc-bg)',
                    border: '1px solid var(--doc-border)',
                  }}
                />
              </PieChart>
            ) : (
              <LineChart data={content.data}>
                <CartesianGrid stroke="var(--doc-border)" strokeDasharray="3 3" />
                <XAxis dataKey="name" stroke="var(--doc-muted)" fontSize={12} />
                <YAxis stroke="var(--doc-muted)" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    background: 'var(--doc-bg)',
                    border: '1px solid var(--doc-border)',
                  }}
                />
                <Line dataKey="value" stroke={accent} strokeWidth={2} dot={{ fill: accent }} />
              </LineChart>
            )}
          </ResponsiveContainer>
        )}
      </div>
    </BlockFrame>
  )
}

function ProgressRing({
  value,
  max,
  label,
  color,
}: {
  value: number
  max: number
  label?: string
  color: string
}) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0
  const r = 80
  const c = 2 * Math.PI * r
  return (
    <svg viewBox="0 0 200 200" className="h-full w-full">
      <circle cx={100} cy={100} r={r} stroke="var(--doc-border)" strokeWidth={14} fill="none" />
      <circle
        cx={100}
        cy={100}
        r={r}
        stroke={color}
        strokeWidth={14}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - pct)}
        transform="rotate(-90 100 100)"
      />
      <text
        x={100}
        y={100}
        dy="0.3em"
        textAnchor="middle"
        fontSize={28}
        fontWeight={600}
        fill="var(--doc-accent)"
      >
        {Math.round(pct * 100)}%
      </text>
      {label && (
        <text x={100} y={140} textAnchor="middle" fontSize={12} fill="var(--doc-muted)">
          {label}
        </text>
      )}
    </svg>
  )
}
