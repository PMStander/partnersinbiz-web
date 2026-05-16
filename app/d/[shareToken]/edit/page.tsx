'use client'

import { use, useCallback, useEffect, useState } from 'react'

import { AccessCodeForm } from '@/components/client-documents/share/AccessCodeForm'
import { SignInForm } from '@/components/client-documents/share/SignInForm'
import { DocumentRenderer } from '@/components/client-documents/DocumentRenderer'
import { DocumentTheme } from '@/components/client-documents/theme/DocumentTheme'
import type { ClientDocument, ClientDocumentVersion } from '@/lib/client-documents/types'

type State =
  | { kind: 'loading' }
  | { kind: 'need_code' }
  | { kind: 'need_auth'; docTitle?: string }
  | { kind: 'ready'; document: ClientDocument; version: ClientDocumentVersion }
  | { kind: 'error'; message: string }

export default function EditSharePage({ params }: { params: Promise<{ shareToken: string }> }) {
  // NOTE: the route segment is named `[shareToken]` for filesystem consistency with the
  // public view page, but the value here is the EDIT share token.
  const { shareToken } = use(params)
  const [state, setState] = useState<State>({ kind: 'loading' })

  const check = useCallback(async () => {
    const res = await fetch(`/api/v1/public/client-documents/edit/${shareToken}`)
    const body = await res.json().catch(() => null)
    if (res.status === 200 && body?.success) {
      setState({
        kind: 'ready',
        document: body.data.document as ClientDocument,
        version: body.data.version as ClientDocumentVersion,
      })
    } else if (res.status === 401 && body?.error === 'Code verification required') {
      setState({ kind: 'need_code' })
    } else if (res.status === 401) {
      setState({ kind: 'need_auth' })
    } else if (res.status === 410) {
      setState({ kind: 'error', message: 'This link has been disabled.' })
    } else if (res.status === 404) {
      setState({ kind: 'error', message: 'Link not found.' })
    } else {
      setState({ kind: 'error', message: body?.error ?? 'Unknown error' })
    }
  }, [shareToken])

  useEffect(() => {
    check()
  }, [check])

  if (state.kind === 'loading') {
    return (
      <DocumentTheme>
        <div className="grid min-h-screen place-items-center text-[var(--doc-muted)]">Loading…</div>
      </DocumentTheme>
    )
  }
  if (state.kind === 'error') {
    return (
      <DocumentTheme>
        <div className="mx-auto mt-32 max-w-sm px-6 text-center text-[var(--doc-text)]">
          <p>{state.message}</p>
        </div>
      </DocumentTheme>
    )
  }
  if (state.kind === 'need_code') {
    return (
      <DocumentTheme>
        <AccessCodeForm editShareToken={shareToken} onSuccess={check} />
      </DocumentTheme>
    )
  }
  if (state.kind === 'need_auth') {
    return (
      <DocumentTheme>
        <SignInForm
          redirectUrl={`/d/${shareToken}/edit`}
          context={{ type: 'edit_share', editShareToken: shareToken }}
          onAuthenticated={check}
        />
      </DocumentTheme>
    )
  }
  return <DocumentRenderer document={state.document} version={state.version} />
}
