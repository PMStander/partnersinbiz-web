// app/(portal)/portal/settings/team/page.tsx
'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { MemberRow } from '@/components/settings/MemberRow'
import type { OrgRole } from '@/lib/organizations/types'

interface Member {
  uid: string
  firstName: string
  lastName: string
  jobTitle: string
  avatarUrl: string
  role: OrgRole
}

interface MyProfile {
  uid: string
  role: OrgRole | null
}

export default function TeamPage() {
  const [members, setMembers] = useState<Member[]>([])
  const [myProfile, setMyProfile] = useState<MyProfile>({ uid: '', role: null })
  const [loading, setLoading] = useState(true)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState('')
  const [inviteSent, setInviteSent] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch('/api/v1/portal/settings/team').then(r => r.ok ? r.json() : null),
      fetch('/api/v1/portal/settings/profile').then(r => r.ok ? r.json() : null),
    ]).then(([teamData, profileData]) => {
      if (Array.isArray(teamData?.members)) setMembers(teamData.members)
      if (profileData?.profile) {
        setMyProfile(p => ({ ...p, role: profileData.profile.role }))
      }
    }).finally(() => setLoading(false))
    // Get current uid from org endpoint
    fetch('/api/v1/portal/org')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.user?.uid) setMyProfile(p => ({ ...p, uid: d.user.uid })) })
      .catch(() => {})
  }, [])

  async function handleRemove(uid: string) {
    if (!confirm('Remove this member from the workspace?')) return
    const res = await fetch(`/api/v1/portal/settings/team/${uid}`, { method: 'DELETE' })
    if (res.ok) setMembers(prev => prev.filter(m => m.uid !== uid))
  }

  async function handleRoleChange(uid: string, newRole: OrgRole) {
    const res = await fetch(`/api/v1/portal/settings/team/${uid}/role`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: newRole }),
    })
    if (res.ok) {
      setMembers(prev => prev.map(m => m.uid === uid ? { ...m, role: newRole } : m))
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    setInviting(true)
    setInviteError('')
    setInviteSent(false)
    const res = await fetch('/api/v1/portal/settings/team/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inviteEmail }),
    })
    if (res.ok) {
      setInviteEmail('')
      setInviteSent(true)
      fetch('/api/v1/portal/settings/team').then(r => r.ok ? r.json() : null).then(d => {
        if (Array.isArray(d?.members)) setMembers(d.members)
      })
    } else {
      const body = await res.json().catch(() => ({}))
      setInviteError(body.error ?? 'Failed to invite. Try again.')
    }
    setInviting(false)
  }

  const viewerRole = myProfile.role ?? 'viewer'
  const canInvite = viewerRole === 'owner' || viewerRole === 'admin'

  if (loading) return <div className="text-sm text-[var(--color-pib-text-muted)]">Loading…</div>

  return (
    <div className="max-w-2xl">
      <h1 className="text-lg font-semibold mb-1">Team</h1>
      <p className="text-sm text-[var(--color-pib-text-muted)] mb-8">
        All members of this workspace.
      </p>

      <div className="bg-[var(--color-pib-surface)] border border-[var(--color-pib-line)] rounded-xl mb-6 overflow-hidden">
        {members.length === 0 ? (
          <p className="text-sm text-[var(--color-pib-text-muted)] px-5 py-6">No members found.</p>
        ) : (
          members.map(m => (
            <MemberRow
              key={m.uid}
              {...m}
              viewerRole={viewerRole as OrgRole}
              isSelf={m.uid === myProfile.uid}
              onRemove={handleRemove}
              onRoleChange={handleRoleChange}
            />
          ))
        )}
      </div>

      {canInvite && (
        <div className="bg-[var(--color-pib-surface)] border border-[var(--color-pib-line)] rounded-xl p-5">
          <h2 className="text-sm font-semibold mb-4">Invite team member</h2>
          <form onSubmit={handleInvite} className="flex gap-3">
            <input
              type="email"
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              placeholder="colleague@example.com"
              required
              className="input-base text-sm flex-1"
            />
            <button type="submit" disabled={inviting} className="btn-primary shrink-0">
              {inviting ? 'Inviting…' : 'Invite'}
            </button>
          </form>
          {inviteSent && <p className="text-xs text-[var(--color-pib-accent)] mt-2">Invite sent.</p>}
          {inviteError && <p className="text-xs text-red-400 mt-2">{inviteError}</p>}
        </div>
      )}
    </div>
  )
}
