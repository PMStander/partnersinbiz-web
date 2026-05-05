interface PipPresencePillProps {
  lastRunAt?: string | null
}

export function PipPresencePill({ lastRunAt }: PipPresencePillProps) {
  let color = 'bg-gray-300'
  let label = 'Pip idle'
  if (lastRunAt) {
    const ageMs = Date.now() - new Date(lastRunAt).getTime()
    if (ageMs < 24 * 60 * 60 * 1000) {
      color = 'bg-green-500'
      label = 'Pip active today'
    } else if (ageMs < 72 * 60 * 60 * 1000) {
      color = 'bg-amber-500'
      label = 'Pip behind'
    } else {
      color = 'bg-red-500'
      label = 'Pip stale'
    }
  }
  return (
    <span className="inline-flex items-center gap-2 text-xs text-[var(--color-pib-text-muted)]">
      <span className={`w-2 h-2 rounded-full ${color}`} />
      {label}
    </span>
  )
}
