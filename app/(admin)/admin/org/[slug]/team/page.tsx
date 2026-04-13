'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

interface OrgMember {
  userId: string
  role: 'owner' | 'admin' | 'member' | 'viewer'
  displayName?: string
  email?: string
  photoURL?: string
}

interface Organization {
  id: string
  name: string
  slug: string
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`pib-skeleton ${className}`} />
}

function RoleBadge({ role }: { role: string }) {
  const map: Record<string, { label: string; color: string }> = {
    owner: { label: 'Owner', color: 'var(--color-accent-v2)' },
    admin: { label: 'Admin', color: '#2563eb' },
    member: { label: 'Member', color: '#6b7280' },
    viewer: { label: 'Viewer', color: '#9ca3af' },
  }
  const r = map[role] ?? { label: role, color: 'var(--color-outline)' }
  return (
    <span
      className="text-[10px] font-label uppercase tracking-wide px-2 py-0.5 rounded-full"
      style={{ background: `${r.color}20`, color: r.color }}
    >
      {r.label}
    </span>
  )
}

function Avatar({ name, photoURL }: { name?: string; photoURL?: string }) {
  if (photoURL) {
    return (
      <img
        src={photoURL}
        alt={name}
        className="w-8 h-8 rounded-full object-cover"
      />
    )
  }

  // Initials fallback
  const initials = (name ?? '?')
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0].toUpperCase())
    .join('')

  return (
    <div
      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-on-surface"
      style={{ backgroundColor: 'var(--color-accent-v2)' }}
    >
      {initials}
    </div>
  )
}

export default function TeamPage() {
  const params = useParams()
  const slug = params.slug as string

  const [org, setOrg] = useState<Organization | null>(null)
  const [members, setMembers] = useState<OrgMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Add member form state
  const [addingMember, setAddingMember] = useState(false)
  const [addEmail, setAddEmail] = useState('')
  const [addRole, setAddRole] = useState('member')
  const [addError, setAddError] = useState<string | null>(null)

  // Updating role
  const [updatingRole, setUpdatingRole] = useState<string | null>(null)
  const [updatingError, setUpdatingError] = useState<string | null>(null)

  // Load organization and members
  useEffect(() => {
    const fetchOrgAndMembers = async () => {
      try {
        setLoading(true)
        setError(null)

        // Fetch all orgs and find by slug
        const orgsRes = await fetch('/api/v1/organizations')
        if (!orgsRes.ok) throw new Error('Failed to fetch organizations')

        const orgsBody = await orgsRes.json()
        const foundOrg = orgsBody.data?.find((o: any) => o.slug === slug)
        if (!foundOrg) throw new Error('Organization not found')

        setOrg(foundOrg)

        // Fetch members
        const membersRes = await fetch(`/api/v1/organizations/${foundOrg.id}/members`)
        if (!membersRes.ok) throw new Error('Failed to fetch members')

        const membersBody = await membersRes.json()
        setMembers(membersBody.data ?? [])
      } catch (e) {
        setError(e instanceof Error ? e.message : 'An error occurred')
      } finally {
        setLoading(false)
      }
    }

    if (slug) {
      fetchOrgAndMembers()
    }
  }, [slug])

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!org || !addEmail) return

    try {
      setAddError(null)
      setAddingMember(true)

      const res = await fetch(`/api/v1/organizations/${org.id}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: addEmail, role: addRole }),
      })

      const body = await res.json()

      if (!res.ok) {
        throw new Error(body.error || 'Failed to add member')
      }

      // Add to local state
      setMembers([...members, body.data])
      setAddEmail('')
      setAddRole('member')
    } catch (e) {
      setAddError(e instanceof Error ? e.message : 'An error occurred')
    } finally {
      setAddingMember(false)
    }
  }

  const handleChangeRole = async (userId: string, newRole: string) => {
    if (!org) return

    try {
      setUpdatingError(null)
      setUpdatingRole(userId)

      const res = await fetch(`/api/v1/organizations/${org.id}/members/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      })

      const body = await res.json()

      if (!res.ok) {
        throw new Error(body.error || 'Failed to update role')
      }

      // Update local state
      setMembers(
        members.map((m) => (m.userId === userId ? { ...m, role: newRole as any } : m)),
      )
    } catch (e) {
      setUpdatingError(e instanceof Error ? e.message : 'An error occurred')
    } finally {
      setUpdatingRole(null)
    }
  }

  const handleRemoveMember = async (userId: string) => {
    if (!org || !confirm('Are you sure you want to remove this member?')) return

    try {
      const res = await fetch(`/api/v1/organizations/${org.id}/members/${userId}`, {
        method: 'DELETE',
      })

      const body = await res.json()

      if (!res.ok) {
        throw new Error(body.error || 'Failed to remove member')
      }

      // Remove from local state
      setMembers(members.filter((m) => m.userId !== userId))
    } catch (e) {
      alert(e instanceof Error ? e.message : 'An error occurred')
    }
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant mb-1">
          Workspace / Team
        </p>
        <h1 className="text-2xl font-headline font-bold text-on-surface">Team</h1>
      </div>

      {/* Error */}
      {error && (
        <div
          className="pib-card border-l-4 p-4"
          style={{ borderColor: '#ef4444', backgroundColor: '#fef2f2' }}
        >
          <p className="text-sm text-[#7f1d1d]">{error}</p>
        </div>
      )}

      {/* Add Member Form */}
      {!loading && org && (
        <div className="pib-card">
          <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant mb-3">
            Add Team Member
          </p>
          <form onSubmit={handleAddMember} className="flex gap-2 flex-wrap">
            <input
              type="email"
              placeholder="user@example.com"
              value={addEmail}
              onChange={(e) => setAddEmail(e.target.value)}
              className="flex-1 min-w-[200px] px-3 py-2 rounded-md text-sm"
              style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-outline)' }}
              disabled={addingMember}
            />
            <select
              value={addRole}
              onChange={(e) => setAddRole(e.target.value)}
              className="px-3 py-2 rounded-md text-sm"
              style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-outline)' }}
              disabled={addingMember}
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
              <option value="viewer">Viewer</option>
            </select>
            <button
              type="submit"
              className="pib-btn-primary text-sm font-label"
              disabled={addingMember || !addEmail}
            >
              {addingMember ? 'Adding...' : 'Add'}
            </button>
          </form>
          {addError && (
            <p className="text-xs text-[#ef4444] mt-2">{addError}</p>
          )}
        </div>
      )}

      {/* Members Table */}
      <div className="pib-card">
        <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant mb-3">
          Members ({members.length})
        </p>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : members.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-on-surface-variant text-sm">No team members yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-on-surface-variant/20">
                  <th className="text-left py-2 px-3 font-label text-[10px] uppercase tracking-widest text-on-surface-variant">
                    Member
                  </th>
                  <th className="text-left py-2 px-3 font-label text-[10px] uppercase tracking-widest text-on-surface-variant">
                    Email
                  </th>
                  <th className="text-left py-2 px-3 font-label text-[10px] uppercase tracking-widest text-on-surface-variant">
                    Role
                  </th>
                  <th className="text-right py-2 px-3 font-label text-[10px] uppercase tracking-widest text-on-surface-variant">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr
                    key={member.userId}
                    className="border-b border-on-surface-variant/10 hover:bg-[var(--color-row-hover)] transition-colors"
                  >
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <Avatar name={member.displayName} photoURL={member.photoURL} />
                        <span className="text-on-surface font-medium text-sm">
                          {member.displayName || 'Unknown'}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <span className="text-on-surface-variant text-sm">{member.email || '—'}</span>
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <RoleBadge role={member.role} />
                        {member.role !== 'owner' && (
                          <select
                            value={member.role}
                            onChange={(e) => handleChangeRole(member.userId, e.target.value)}
                            disabled={updatingRole === member.userId}
                            className="text-xs px-2 py-1 rounded-md opacity-0 hover:opacity-100 transition-opacity"
                            style={{
                              backgroundColor: 'var(--color-surface)',
                              border: '1px solid var(--color-outline)',
                            }}
                          >
                            <option value="member">Member</option>
                            <option value="admin">Admin</option>
                            <option value="viewer">Viewer</option>
                          </select>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right">
                      {member.role !== 'owner' && (
                        <button
                          onClick={() => handleRemoveMember(member.userId)}
                          className="text-xs text-[#ef4444] hover:text-[#dc2626] font-medium"
                        >
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {updatingError && (
          <p className="text-xs text-[#ef4444] mt-2">{updatingError}</p>
        )}
      </div>
    </div>
  )
}
