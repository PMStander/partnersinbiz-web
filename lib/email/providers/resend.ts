// lib/email/providers/resend.ts
//
// Resend adapter. Wraps the official `resend` SDK. Singleton client is lazy-
// initialised so importing this module at build time is safe.

import { Resend } from 'resend'
import {
  buildSendHeaders,
  type EmailProvider,
  type EmailProviderSendInput,
  type EmailProviderSendResult,
} from '../provider'

let client: Resend | null = null

function getClient(): Resend {
  if (!client) {
    client = new Resend(process.env.RESEND_API_KEY)
  }
  return client
}

/** Test hook — drops the cached client (e.g. after RESEND_API_KEY changes). */
export function resetResendClientForTests(): void {
  client = null
}

export function createResendProvider(): EmailProvider {
  return {
    id: 'resend',

    isConfigured(): boolean {
      return !!process.env.RESEND_API_KEY?.trim()
    },

    async send(input: EmailProviderSendInput): Promise<EmailProviderSendResult> {
      const headers = buildSendHeaders(input)
      const { data, error } = await getClient().emails.send({
        from: input.from,
        to: input.to,
        cc: input.cc?.length ? input.cc : undefined,
        replyTo: input.replyTo,
        subject: input.subject,
        html: input.html,
        text: input.text,
        headers: Object.keys(headers).length > 0 ? headers : undefined,
      })
      if (error || !data?.id) {
        return {
          ok: false,
          messageId: '',
          provider: 'resend',
          error: error?.message ?? 'Resend send failed',
        }
      }
      return { ok: true, messageId: data.id, provider: 'resend' }
    },
  }
}
