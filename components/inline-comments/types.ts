export type CommentAnchor =
  | { type: 'text'; text: string; offset?: number }
  | { type: 'image'; mediaUrl: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FirestoreTs = { _seconds?: number; seconds?: number } | any

export interface InlineComment {
  id: string
  text: string
  userId: string
  userName: string
  userRole: 'admin' | 'client' | 'ai'
  createdAt: FirestoreTs
  agentPickedUp: boolean
  agentPickedUpAt?: FirestoreTs | null
  anchor?: CommentAnchor | null
}

export type AnchorTarget =
  | { kind: 'text'; text: string; offset?: number }
  | { kind: 'image'; mediaUrl: string }
  | { kind: 'general' }
