// components/admin/crm/ActivityTimeline.tsx

const TYPE_LABELS: Record<string, string> = {
  email_sent: 'Email sent',
  email_received: 'Email received',
  call: 'Call',
  note: 'Note',
  stage_change: 'Stage changed',
  sequence_enrolled: 'Enrolled in sequence',
  sequence_completed: 'Sequence completed',
}

interface Activity {
  id: string
  type: string
  summary: string
  createdAt: { seconds: number } | null
}

interface ActivityTimelineProps {
  activities: Activity[]
  loading: boolean
}

export function ActivityTimeline({ activities, loading }: ActivityTimelineProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-16 bg-surface-container animate-pulse" />
        ))}
      </div>
    )
  }

  if (activities.length === 0) {
    return (
      <p className="text-on-surface-variant text-sm py-6 text-center">
        No activity yet. Send an email or add a note to get started.
      </p>
    )
  }

  return (
    <div className="space-y-0">
      {activities.map((a, i) => (
        <div key={a.id} className={`flex gap-4 pb-4 ${i < activities.length - 1 ? 'border-b border-outline-variant' : ''}`}>
          <div className="pt-1 shrink-0">
            <div className="w-1.5 h-1.5 bg-on-surface-variant rounded-full mt-1.5" />
          </div>
          <div className="flex-1 pt-0.5">
            <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant mb-0.5">
              {TYPE_LABELS[a.type] ?? a.type}
              {a.createdAt && (
                <span className="ml-2 normal-case">
                  · {new Date(a.createdAt.seconds * 1000).toLocaleDateString()}
                </span>
              )}
            </p>
            <p className="text-sm text-on-surface">{a.summary}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
