'use client'

export interface DiffWarning {
  field?: string  // optional field name (e.g. "objective", "daily_budget")
  message: string
  severity?: 'info' | 'warning' | 'error'
}

interface Props {
  open: boolean
  warnings: DiffWarning[]
  title?: string
  proceedLabel?: string
  cancelLabel?: string
  onProceed: () => void
  onCancel: () => void
}

export function DiffWarningDialog({
  open,
  warnings,
  title = 'Review changes',
  proceedLabel = 'Proceed anyway',
  cancelLabel = 'Cancel',
  onProceed,
  onCancel,
}: Props) {
  if (!open) return null

  const hasErrors = warnings.some((w) => w.severity === 'error')

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="diff-warning-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
    >
      <div className="w-full max-w-lg rounded-lg border border-white/10 bg-[#0A0A0B] p-6 shadow-2xl">
        <h2 id="diff-warning-title" className="text-lg font-semibold">
          {title}
        </h2>
        <p className="mt-1 text-sm text-white/60">
          {warnings.length} {warnings.length === 1 ? 'issue' : 'issues'} found
          {hasErrors ? ' — errors must be resolved before launching' : ''}.
        </p>

        <ul className="mt-4 space-y-2">
          {warnings.map((w, i) => (
            <li
              key={i}
              className={`rounded border px-3 py-2 text-sm ${
                w.severity === 'error'
                  ? 'border-red-500/40 bg-red-500/5'
                  : w.severity === 'warning'
                    ? 'border-[#F5A623]/40 bg-[#F5A623]/5'
                    : 'border-white/10 bg-white/5'
              }`}
            >
              {w.field && (
                <div className="text-xs uppercase tracking-wide text-white/40">{w.field}</div>
              )}
              <div className="mt-0.5 text-white/90">{w.message}</div>
            </li>
          ))}
        </ul>

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="btn-pib-ghost text-sm" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className="btn-pib-accent text-sm"
            onClick={onProceed}
            disabled={hasErrors}
            aria-disabled={hasErrors}
          >
            {proceedLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
