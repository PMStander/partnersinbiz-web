'use client'

import { CommentList } from '@/components/inline-comments'
import type { InlineComment } from '@/components/inline-comments/types'
import type { ClientDocument, DocumentAssumption, DocumentComment } from '@/lib/client-documents/types'

function commentToInline(comment: DocumentComment): InlineComment {
  return {
    id: comment.id,
    text: comment.text,
    userId: comment.userId,
    userName: comment.userName,
    userRole: comment.userRole === 'agent' ? 'ai' : comment.userRole,
    createdAt: comment.createdAt,
    agentPickedUp: comment.agentPickedUp,
    anchor: comment.anchor ?? null,
  }
}

export function DocumentReviewRail({
  document,
  comments,
  onPublish,
}: {
  document: ClientDocument
  comments: DocumentComment[]
  onPublish?: () => void
}) {
  const blockers = (document.assumptions ?? []).filter((assumption: DocumentAssumption) => {
    return assumption.status === 'open' && assumption.severity === 'blocks_publish'
  })

  return (
    <aside className="space-y-4">
      <div className="pib-card p-4">
        <p className="text-xs uppercase tracking-[0.18em] text-on-surface-variant">Status</p>
        <p className="mt-2 text-lg font-medium capitalize">{document.status.replaceAll('_', ' ')}</p>
        {blockers.length > 0 && (
          <p className="mt-3 text-xs text-amber-300">
            {blockers.length} blocking assumption{blockers.length === 1 ? '' : 's'}
          </p>
        )}
        {onPublish && (
          <button
            type="button"
            onClick={onPublish}
            disabled={blockers.length > 0}
            className="mt-4 w-full rounded-md px-3 py-2 text-sm font-medium disabled:opacity-50"
            style={{ background: 'var(--color-pib-accent)', color: '#000' }}
          >
            Publish to client
          </button>
        )}
      </div>
      <CommentList comments={comments.map(commentToInline)} />
    </aside>
  )
}
