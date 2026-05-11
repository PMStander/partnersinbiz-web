// app/preferences/[token]/page.tsx
//
// Public preferences page. Verifies the HMAC-signed token (same signer as
// the unsubscribe link), loads the contact + org config + current
// preferences, and renders a clean form. Works WITHOUT JavaScript — the
// form posts back to `/api/preferences/[token]` which server-side processes
// the update and re-renders this page with a "Saved!" notice.

import { adminDb } from '@/lib/firebase/admin'
import { verifyUnsubscribeToken } from '@/lib/email/unsubscribeToken'
import {
  getOrgPreferencesConfig,
  getContactPreferences,
} from '@/lib/preferences/store'
import type { OrgPreferencesConfig, ContactPreferences, FrequencyChoice } from '@/lib/preferences/types'

export const dynamic = 'force-dynamic'

type Props = {
  params: Promise<{ token: string }>
  searchParams?: Promise<{ saved?: string; error?: string }>
}

interface PageState {
  status: 'ok' | 'invalid' | 'missing-contact'
  contactId?: string
  email?: string
  orgConfig?: OrgPreferencesConfig
  prefs?: ContactPreferences
  orgId?: string
}

async function loadState(token: string): Promise<PageState> {
  const verified = verifyUnsubscribeToken(token)
  if (!verified.ok) return { status: 'invalid' }
  const contactId = verified.contactId

  const cSnap = await adminDb.collection('contacts').doc(contactId).get()
  if (!cSnap.exists) return { status: 'missing-contact' }
  const cd = cSnap.data() ?? {}
  const orgId = typeof cd.orgId === 'string' ? cd.orgId : ''
  if (!orgId) return { status: 'missing-contact' }

  const orgConfig = await getOrgPreferencesConfig(orgId)
  const prefs = await getContactPreferences(contactId, orgId)

  return {
    status: 'ok',
    contactId,
    email: typeof cd.email === 'string' ? cd.email : '',
    orgConfig,
    prefs,
    orgId,
  }
}

function PageShell(props: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0b0b0c',
        color: '#fafafa',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div
        style={{
          maxWidth: 560,
          width: '100%',
          background: '#161617',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 16,
          padding: 36,
          boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
        }}
      >
        {props.children}
      </div>
    </div>
  )
}

const FREQUENCY_OPTIONS: Array<{ value: FrequencyChoice; label: string; help: string }> = [
  { value: 'all', label: 'All emails', help: 'Send me everything I’m signed up for.' },
  { value: 'weekly', label: 'Weekly at most', help: 'At most one email per week.' },
  { value: 'monthly', label: 'Monthly at most', help: 'At most one email per month.' },
  {
    value: 'transactional-only',
    label: 'Important account emails only',
    help: 'Receipts and account notifications. No marketing.',
  },
  { value: 'none', label: 'Unsubscribe from everything', help: 'Stop all emails entirely.' },
]

export default async function PreferencesPage({ params, searchParams }: Props) {
  const { token } = await params
  const search: { saved?: string; error?: string } =
    (await (searchParams ?? Promise.resolve({}))) ?? {}
  const state = await loadState(token)

  if (state.status === 'invalid') {
    return (
      <PageShell>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 10px 0', color: '#fafafa' }}>
          This link is invalid or has expired
        </h1>
        <p style={{ margin: 0, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }}>
          We couldn’t verify this preferences link. If you want to update your subscription, reach
          out to the sender directly.
        </p>
      </PageShell>
    )
  }

  if (state.status === 'missing-contact') {
    return (
      <PageShell>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 10px 0' }}>
          Subscription not found
        </h1>
        <p style={{ margin: 0, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }}>
          We couldn’t find your contact record. It may have been removed.
        </p>
      </PageShell>
    )
  }

  const orgConfig = state.orgConfig!
  const prefs = state.prefs!
  const email = state.email ?? ''
  const saved = search.saved === '1'
  const errored = !!search.error

  return (
    <PageShell>
      <h1 style={{ fontSize: 24, fontWeight: 600, margin: '0 0 6px 0', color: '#fafafa' }}>
        {orgConfig.preferencesPageHeading}
      </h1>
      <p style={{ margin: '0 0 24px 0', color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }}>
        {orgConfig.preferencesPageSubheading}
        {email ? (
          <>
            <br />
            <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13 }}>
              Updating preferences for <strong style={{ color: '#fafafa' }}>{email}</strong>
            </span>
          </>
        ) : null}
      </p>

      {saved && (
        <div
          style={{
            background: 'rgba(34,197,94,0.12)',
            border: '1px solid rgba(34,197,94,0.4)',
            color: '#86efac',
            padding: '10px 14px',
            borderRadius: 10,
            marginBottom: 18,
            fontSize: 14,
          }}
        >
          Saved. Your preferences have been updated.
        </div>
      )}
      {errored && (
        <div
          style={{
            background: 'rgba(239,68,68,0.12)',
            border: '1px solid rgba(239,68,68,0.4)',
            color: '#fca5a5',
            padding: '10px 14px',
            borderRadius: 10,
            marginBottom: 18,
            fontSize: 14,
          }}
        >
          We couldn’t save your changes. Please try again.
        </div>
      )}

      <form
        method="POST"
        action={`/api/preferences/${encodeURIComponent(token)}`}
        style={{ display: 'flex', flexDirection: 'column', gap: 24 }}
      >
        <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
          <legend style={{ fontSize: 16, fontWeight: 600, marginBottom: 10, color: '#fafafa' }}>
            Topics
          </legend>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {orgConfig.topics.map((t) => {
              const checked =
                typeof prefs.topics[t.id] === 'boolean' ? prefs.topics[t.id] : t.defaultOptIn
              const isTransactional = t.id === 'transactional'
              return (
                <label
                  key={t.id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    background: 'rgba(255,255,255,0.03)',
                    padding: 12,
                    borderRadius: 10,
                    cursor: isTransactional ? 'not-allowed' : 'pointer',
                    opacity: isTransactional ? 0.7 : 1,
                  }}
                >
                  <input
                    type="checkbox"
                    name={`topic_${t.id}`}
                    defaultChecked={isTransactional ? true : checked}
                    disabled={isTransactional}
                    style={{ marginTop: 3 }}
                  />
                  <div>
                    <div style={{ fontWeight: 500, color: '#fafafa' }}>{t.label}</div>
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
                      {t.description}
                    </div>
                  </div>
                </label>
              )
            })}
          </div>
        </fieldset>

        <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
          <legend style={{ fontSize: 16, fontWeight: 600, marginBottom: 10, color: '#fafafa' }}>
            How often
          </legend>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {FREQUENCY_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  background: 'rgba(255,255,255,0.03)',
                  padding: 10,
                  borderRadius: 10,
                  cursor: 'pointer',
                }}
              >
                <input
                  type="radio"
                  name="frequency"
                  value={opt.value}
                  defaultChecked={prefs.frequency === opt.value}
                  style={{ marginTop: 3 }}
                />
                <div>
                  <div style={{ fontWeight: 500, color: '#fafafa' }}>{opt.label}</div>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>{opt.help}</div>
                </div>
              </label>
            ))}
          </div>
        </fieldset>

        <button
          type="submit"
          style={{
            background: '#F59E0B',
            color: '#0b0b0c',
            border: 'none',
            padding: '12px 18px',
            borderRadius: 10,
            fontWeight: 600,
            cursor: 'pointer',
            fontSize: 15,
          }}
        >
          Save preferences
        </button>
      </form>
    </PageShell>
  )
}
