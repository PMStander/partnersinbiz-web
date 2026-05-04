interface HealthBadgeProps {
  score?: number | null
  signalsCount?: number
}

export function HealthBadge({ score, signalsCount = 0 }: HealthBadgeProps) {
  let color = 'bg-gray-200 text-gray-700'
  let label = 'unknown'
  if (typeof score === 'number') {
    if (score >= 80) {
      color = 'bg-green-100 text-green-800'
      label = `healthy${signalsCount > 0 ? ` · ${signalsCount}` : ''}`
    } else if (score >= 50) {
      color = 'bg-amber-100 text-amber-800'
      label = `attention · ${signalsCount}`
    } else {
      color = 'bg-red-100 text-red-800'
      label = `unhealthy · ${signalsCount}`
    }
  }
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${color}`}>{label}</span>
}
