'use client'

import UnifiedChat from '@/components/chat/UnifiedChat'

interface MessagesClientProps {
  orgId: string
  uid: string
  displayName: string
}

export default function MessagesClient({ orgId, uid, displayName }: MessagesClientProps) {
  // calc: 100dvh minus the admin banner (56px) and main's py-8 padding (64px)
  return (
    <div className="flex flex-col gap-4 overflow-hidden" style={{ height: 'calc(100dvh - 120px)' }}>
      <div className="shrink-0">
        <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant mb-1">
          Workspace / Messages
        </p>
        <h1 className="text-2xl font-headline font-bold text-on-surface">Messages</h1>
        <p className="text-sm text-on-surface-variant mt-1">
          Multi-participant conversations with your team and agents.
        </p>
      </div>

      <UnifiedChat
        orgId={orgId}
        currentUserUid={uid}
        currentUserDisplayName={displayName}
      />
    </div>
  )
}
