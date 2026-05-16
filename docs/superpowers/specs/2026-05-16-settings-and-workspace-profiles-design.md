# Settings Panel & Workspace Profiles — Design Spec
**Date:** 2026-05-16  
**Status:** Approved  
**Context:** Portal avatar click → settings. CRM-readiness prerequisite.

---

## 1. Problem

The current `/portal/settings` page is a single flat page with a display-name field, read-only org info, and a push-notifications toggle. It has no concept of workspace-specific identity, no team management, and no permission model. Before shipping a CRM, every user record that appears on a contact or activity needs a clear, workspace-scoped identity (name, title, avatar). Team access rules must be defined before contacts and pipelines can be assigned.

---

## 2. Core Concepts

### 2.1 User account (system-level)
Tied to the Firebase Auth UID. Not workspace-specific. Contains:
- Login email (read-only — owned by Firebase Auth)
- Password change flow (Firebase password reset)
- Push notification preferences
- List of linked workspaces with a switcher

Stored in: `users/{uid}` (existing collection)

### 2.2 Workspace profile (org-level)
Who this person is *inside a specific workspace*. Completely separate from the user account — no fallback, no inheritance. One document per (user × org) pair. Contains:
- First name, last name
- Job title (free text, e.g. "CEO", "Sales Manager")
- Work phone
- Avatar URL for this workspace

Stored in: **new** `orgMembers/{orgId}_{uid}` flat collection  
(also referenced from `organizations/{id}/members[]` array which stays for org-level lookups)

This is what the CRM uses everywhere: contact ownership, activity attribution, comments, assignments. A user can have "Peet — CEO" in Workspace A and "Peet — Marketing Lead" in Workspace B using the same login.

---

## 3. Interaction Pattern

**Avatar click** (bottom of portal sidebar) → opens the Settings side panel.

The sidebar is replaced with a settings sub-nav. The main content area shows the selected settings page. A back arrow or clicking outside returns to the normal portal.

Settings panel nav structure:

```
← Back to portal

  [Avatar] Peet Stander
           peet@acme.com

  ACCOUNT
  ⚙  Account settings
  🔔  Notifications
  🔗  My workspaces

  WORKSPACE  (scoped to active workspace)
  👤  My profile
  👥  Team              [owner/admin only]
  🛡  Permissions       [owner only]
```

Workspace sections are scoped to whichever workspace is currently active. If the user switches workspaces from the sidebar switcher, the workspace sections reload for the new org.

---

## 4. Section Specs

### 4.1 Account settings
Route: `/portal/settings/account`

| Field | Behaviour |
|---|---|
| Login email | Read-only. Displayed for reference. |
| Change password | Triggers Firebase password reset email. Confirmation toast. |

No editable name field here — that lives on the workspace profile.

### 4.2 Notifications
Route: `/portal/settings/notifications`

Move the existing `PushNotificationsToggle` here. No other changes needed for now.

### 4.3 My workspaces
Route: `/portal/settings/workspaces`

List of all workspaces the user belongs to. For each workspace: name, initials badge, and a "Switch" button (same as the sidebar switcher). If only one workspace, still show it — it's the canonical place to see what you're linked to.

No add/leave buttons — workspace membership is managed by PiB admins or workspace owners via the Team section.

### 4.4 My profile (workspace)
Route: `/portal/settings/profile`

Editable form for the active workspace profile. Fields:
- First name (required)
- Last name (required)  
- Job title (optional)
- Work phone (optional)
- Avatar upload (optional — stored as URL in the member doc)

On save: PATCH `orgMembers/{orgId}_{uid}`. The portal layout fetches the workspace profile on mount (via `GET /api/v1/portal/settings/profile`) and uses `firstName + lastName` for the sidebar user chip — replacing the current Firebase `displayName` source. If no workspace profile exists yet, falls back to Firebase `displayName` or email prefix.

### 4.5 Team
Route: `/portal/settings/team`

Visible to: **owner and admin roles only** (members and viewers see a read-only list).

Displays all members of the active workspace as a table:

| Column | Notes |
|---|---|
| Avatar + name | From their workspace profile (`orgMembers`) |
| Job title | From workspace profile |
| Role badge | owner / admin / member / viewer |
| Actions | Change role (owner only), Remove (owner + admin) |

**Invite member**: email input → calls existing `POST /api/v1/organizations/{id}/create-login` (already built). The new member will be prompted to set their workspace profile on first login via a one-time banner.

**Remove member**: sets the member's `orgIds` to exclude this org, removes them from `organizations/{id}/members[]`, and deletes their `orgMembers/{orgId}_{uid}` doc. Does not delete the Firebase Auth account. Any CRM contacts assigned to this member remain assigned by UID — contact reassignment UI is handled in the CRM sprint.

**Change role**: owner-only. PATCH `orgMembers/{orgId}_{uid}.role` + update `organizations/{id}/members[]` entry.

### 4.6 Permissions
Route: `/portal/settings/permissions`

Visible to: **owner only**.

Toggle UI for the member-configurable capabilities. Stored as `organizations/{id}/settings.permissions` object in Firestore.

Default values (all shown as on/off toggles):

| Toggle | Default |
|---|---|
| Members can delete contacts | OFF |
| Members can export contacts | OFF |
| Members can create/send campaigns | ON |

Fixed (non-toggleable) behaviours are documented in the UI as greyed-out rows with a lock icon so owners understand the full model without confusion.

---

## 5. Data Model

### `orgMembers` collection (new)
Document ID: `{orgId}_{uid}`

```typescript
interface OrgMemberProfile {
  orgId: string
  uid: string
  firstName: string
  lastName: string
  jobTitle?: string
  phone?: string
  avatarUrl?: string
  role: 'owner' | 'admin' | 'member' | 'viewer'
  createdAt: Timestamp
  updatedAt: Timestamp
}
```

**Why a flat collection instead of a subcollection?** A flat `orgMembers` collection with a composite ID allows a single `collectionGroup` query to find all memberships for a user across workspaces, and a simple `where('orgId', '==', id)` to list all members of an org — without needing two separate queries.

### `organizations/{id}/settings.permissions` (extension of existing)
```typescript
interface OrgPermissions {
  membersCanDeleteContacts: boolean   // default: false
  membersCanExportContacts: boolean   // default: false
  membersCanSendCampaigns: boolean    // default: true
}
```

### `users/{uid}` (existing — no new fields needed)
The `orgIds[]` and `activeOrgId` fields added in the multi-workspace feature are sufficient. No name/avatar stored here.

---

## 6. Permission Matrix

| Capability | Owner | Admin | Member | Viewer |
|---|:---:|:---:|:---:|:---:|
| View contacts | ✓ | ✓ | ✓ | ✓ |
| Create / edit contacts | ✓ | ✓ | ✓ | — |
| Delete contacts | ✓ | ✓ | toggle | — |
| Export contacts | ✓ | ✓ | toggle | — |
| Log own activities | ✓ | ✓ | ✓ | — |
| Edit/delete others' activities | ✓ | ✓ | — | — |
| View campaigns | ✓ | ✓ | ✓ | ✓ |
| Create / send campaigns | ✓ | ✓ | toggle | — |
| View & comment on documents | ✓ | ✓ | ✓ | ✓ |
| Approve / accept documents | ✓ | ✓ | ✓ | — |
| View team members | ✓ | ✓ | ✓ | ✓ |
| Invite / remove members | ✓ | ✓ | — | — |
| Change member roles | ✓ | — | — | — |
| Edit workspace permissions | ✓ | — | — | — |

**toggle** = owner configures via Permissions section. Default value shown in section 4.6.

---

## 7. API Routes (new)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/v1/portal/settings/profile` | session | Get own workspace profile for active org |
| PATCH | `/api/v1/portal/settings/profile` | session | Update own workspace profile |
| GET | `/api/v1/portal/settings/team` | session | List all member profiles for active org |
| POST | `/api/v1/portal/settings/team/invite` | session (owner/admin) | Invite new member (wraps create-login) |
| DELETE | `/api/v1/portal/settings/team/{uid}` | session (owner/admin) | Remove member from workspace |
| PATCH | `/api/v1/portal/settings/team/{uid}/role` | session (owner only) | Change a member's role |
| GET | `/api/v1/portal/settings/permissions` | session (owner) | Get workspace permission toggles |
| PATCH | `/api/v1/portal/settings/permissions` | session (owner) | Update permission toggles |

All routes resolve org from `activeOrgId` via the existing `tenant.ts` middleware. Role enforcement is via a new `requireOrgRole(minRole)` wrapper.

---

## 8. UI Components (new)

| Component | Location | Notes |
|---|---|---|
| `SettingsPanel` | `components/settings/SettingsPanel.tsx` | Side panel wrapper, sub-nav, back button |
| `AccountSettingsPage` | `app/(portal)/portal/settings/account/page.tsx` | Email display + password reset |
| `NotificationsPage` | `app/(portal)/portal/settings/notifications/page.tsx` | Moved from current settings page |
| `WorkspacesPage` | `app/(portal)/portal/settings/workspaces/page.tsx` | Linked workspace list + switcher |
| `ProfilePage` | `app/(portal)/portal/settings/profile/page.tsx` | Workspace profile form |
| `TeamPage` | `app/(portal)/portal/settings/team/page.tsx` | Member table, invite, remove, role change |
| `PermissionsPage` | `app/(portal)/portal/settings/permissions/page.tsx` | Toggle rows, owner-only |
| `MemberRow` | `components/settings/MemberRow.tsx` | Avatar, name, title, role badge, actions |

The existing `/portal/settings/page.tsx` is retired — replaced by the `account` sub-page. A redirect from `/portal/settings` → `/portal/settings/account` handles any bookmarked links.

---

## 9. First-login banner

When a member logs into a workspace for the first time and has no `orgMemberProfile` doc yet (or `firstName` is blank), the portal dashboard shows a dismissible banner:

> **Complete your workspace profile** — Add your name and title so your team knows who you are. [Set up profile →]

Dismissing sets a `profileBannerDismissed: true` flag on the member doc so it doesn't re-appear.

---

## 10. Out of scope (this sprint)

- Avatar file upload (URL field only for now — can point to a Gravatar or be left blank)
- Email notification preferences (beyond push toggle)
- Two-factor authentication
- SSO / SAML
- Per-contact visibility rules ("only assigned member can see this contact") — deferred to CRM sprint
