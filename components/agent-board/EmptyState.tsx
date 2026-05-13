import Link from 'next/link'

type Props = { slug: string }

export function EmptyState({ slug }: Props) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-20 px-6">
      <span className="material-symbols-outlined text-6xl text-on-surface-variant/60">smart_toy</span>
      <h2 className="mt-4 text-lg font-medium text-on-surface">No agent tasks yet</h2>
      <p className="mt-2 text-sm text-on-surface-variant max-w-md">
        Ask Pip in the chat to create a task for itself, and it&apos;ll appear here.
      </p>
      <Link
        href={`/admin/org/${slug}/agent`}
        className="mt-6 inline-flex items-center gap-2 rounded-full bg-amber-500/15 text-amber-200 border border-amber-400/30 px-4 py-2 text-sm font-medium hover:bg-amber-500/25 transition"
      >
        Open Pip chat <span className="material-symbols-outlined text-base">arrow_forward</span>
      </Link>
    </div>
  )
}
