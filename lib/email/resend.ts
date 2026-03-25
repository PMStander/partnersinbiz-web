// lib/email/resend.ts
import { Resend } from 'resend'

export const FROM_ADDRESS = 'peet@partnersinbiz.online'

let client: Resend | null = null

/** Returns a singleton Resend client. Lazy-initialised so it is safe at build time. */
export function getResendClient(): Resend {
  if (!client) {
    client = new Resend(process.env.RESEND_API_KEY)
  }
  return client
}

/**
 * Wraps plain-text body lines in simple HTML paragraphs.
 * Used when bodyHtml is not explicitly provided by the caller.
 */
export function plainTextToHtml(text: string): string {
  const lines = text
    .split('\n')
    .map((l) => `<p style="margin:0 0 8px">${l}</p>`)
    .join('')
  return `<div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #111;">${lines}</div>`
}

/**
 * Strips HTML tags to produce a plain-text fallback from bodyHtml.
 */
export function htmlToPlainText(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
}
