// lib/crm/integrations/syncOptOut.ts
//
// Propagates a PiB unsubscribe back to every active Mailchimp integration for
// the contact's org so the member is also marked unsubscribed at the source.
//
// Errors are always caught — this helper must never throw, because it is called
// as a fire-and-forget side-effect from the unsubscribe page handler.

import { createHash } from 'crypto'
import { adminDb } from '@/lib/firebase/admin'
import type { CrmIntegration } from './types'

function md5Hex(input: string): string {
  return createHash('md5').update(input).digest('hex')
}

/**
 * Given a contactId + orgId, finds all Mailchimp integrations for that org and
 * unsubscribes the contact's email from each list.
 *
 * Never throws. All errors are logged and swallowed so the unsubscribe page
 * always renders successfully.
 */
export async function syncUnsubscribeToIntegrations(
  contactId: string,
  orgId: string,
): Promise<void> {
  try {
    // 1. Get the contact's email
    const contactDoc = await adminDb.collection('contacts').doc(contactId).get()
    if (!contactDoc.exists) {
      console.warn('[syncOptOut] contact not found', contactId)
      return
    }
    const email = (contactDoc.data()?.email as string | undefined)?.trim().toLowerCase()
    if (!email) {
      console.warn('[syncOptOut] contact has no email', contactId)
      return
    }

    // 2. Find all active (or recently errored) Mailchimp integrations for this org
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const snap = await (adminDb.collection('crm_integrations') as any)
      .where('orgId', '==', orgId)
      .where('provider', '==', 'mailchimp')
      .get()

    const integrations: CrmIntegration[] = snap.docs
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((d: any) => ({ id: d.id, ...d.data() }) as CrmIntegration)
      .filter(
        (i: CrmIntegration) =>
          !i.deleted &&
          (i.status === 'active' || i.status === 'pending' || i.status === 'error'),
      )

    if (integrations.length === 0) return

    const emailHash = md5Hex(email)

    // 3. Unsubscribe from each list
    await Promise.all(
      integrations.map(async (integration) => {
        const apiKey = integration.config?.apiKey ?? ''
        const listId = integration.config?.listId ?? ''
        if (!apiKey || !listId) {
          console.warn('[syncOptOut] integration missing apiKey/listId', integration.id)
          return
        }

        const dcMatch = apiKey.match(/-([a-z0-9]+)$/)
        if (!dcMatch) {
          console.warn('[syncOptOut] invalid apiKey format for integration', integration.id)
          return
        }
        const dc = dcMatch[1]

        const url = `https://${dc}.api.mailchimp.com/3.0/lists/${encodeURIComponent(listId)}/members/${emailHash}`
        const auth = 'Basic ' + Buffer.from(`anystring:${apiKey}`).toString('base64')

        try {
          const res = await fetch(url, {
            method: 'PUT',
            headers: {
              Authorization: auth,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ status: 'unsubscribed' }),
          })
          if (!res.ok) {
            const body = await res.text().catch(() => '')
            console.error(
              `[syncOptOut] Mailchimp unsubscribe failed for integration ${integration.id}: ${res.status} ${body.slice(0, 200)}`,
            )
          }
        } catch (err) {
          console.error('[syncOptOut] fetch error for integration', integration.id, err)
        }
      }),
    )
  } catch (err) {
    console.error('[syncOptOut] unexpected error — opt-out sync aborted', err)
  }
}
