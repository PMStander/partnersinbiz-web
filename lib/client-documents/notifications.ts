// lib/client-documents/notifications.ts
//
// Fire-and-forget email notifications for client document lifecycle events.
// All functions are async but callers should use `void fn()` — do not let
// email failures block API responses.

import { sendEmail } from '@/lib/email/send'
import type { ClientDocument, DocumentApproval, DocumentComment } from '@/lib/client-documents/types'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://partnersinbiz.online'
const BRAND_COLOR = '#F5A623'

function ctaButton(href: string, label: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
      <tr>
        <td style="border-radius:6px;background:${BRAND_COLOR};">
          <a href="${href}" target="_blank"
             style="display:inline-block;padding:12px 28px;color:#000000;font-family:sans-serif;font-size:15px;font-weight:600;text-decoration:none;border-radius:6px;">
            ${label}
          </a>
        </td>
      </tr>
    </table>`
}

function emailWrapper(body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f4f4f5;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600"
               style="max-width:600px;width:100%;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background:#0A0A0B;padding:24px 32px;">
              <span style="font-size:20px;font-weight:700;color:#F7F4EE;font-family:sans-serif;">
                Partners <span style="color:${BRAND_COLOR};">in Biz</span>
              </span>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;color:#1a1a1a;font-size:15px;line-height:1.6;">
              ${body}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;font-family:sans-serif;">
              Partners in Biz — Client Growth Platform &nbsp;|&nbsp;
              <a href="https://partnersinbiz.online" style="color:${BRAND_COLOR};text-decoration:none;">partnersinbiz.online</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export async function sendDocumentPublishedEmail(
  document: ClientDocument,
  recipientEmail: string,
  recipientName: string,
): Promise<void> {
  const href = `${BASE_URL}/d/${document.shareToken}`
  const html = emailWrapper(`
    <p style="margin:0 0 8px;color:#6b7280;font-size:13px;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;">Action Required</p>
    <h1 style="margin:0 0 20px;font-size:22px;font-weight:700;color:#0A0A0B;">${document.title}</h1>
    <p style="margin:0 0 16px;">Hi ${recipientName},</p>
    <p style="margin:0 0 16px;">
      Partners in Biz has shared a new document with you:
      <strong>${document.title}</strong>.
      Please review it at your earliest convenience.
    </p>
    <p style="margin:0 0 16px;">
      You can leave inline comments and, once ready, submit your approval directly through the document.
    </p>
    ${ctaButton(href, 'Review Document')}
    <p style="margin:16px 0 0;font-size:13px;color:#6b7280;">
      Or copy this link: <a href="${href}" style="color:${BRAND_COLOR};">${href}</a>
    </p>
  `)

  await sendEmail({
    to: recipientEmail,
    subject: `[Action Required] ${document.title} — Ready for Your Review`,
    html,
  })
}

export async function sendDocumentCommentEmail(
  document: ClientDocument,
  comment: DocumentComment,
  recipientEmail: string,
  recipientName: string,
): Promise<void> {
  const href = `${BASE_URL}/d/${document.shareToken}`
  const html = emailWrapper(`
    <h1 style="margin:0 0 20px;font-size:22px;font-weight:700;color:#0A0A0B;">New comment on ${document.title}</h1>
    <p style="margin:0 0 16px;">Hi ${recipientName},</p>
    <p style="margin:0 0 16px;">
      <strong>${comment.userName}</strong> left a comment on
      <strong>${document.title}</strong>:
    </p>
    <blockquote style="margin:0 0 20px;padding:14px 18px;background:#f9fafb;border-left:4px solid ${BRAND_COLOR};border-radius:4px;font-style:italic;color:#374151;">
      "${comment.text}"
    </blockquote>
    <p style="margin:0 0 16px;">View the document to respond or resolve the comment.</p>
    ${ctaButton(href, 'View Document')}
  `)

  await sendEmail({
    to: recipientEmail,
    subject: `New comment on ${document.title}`,
    html,
  })
}

export async function sendDocumentApprovedEmail(
  document: ClientDocument,
  approval: DocumentApproval,
  recipientEmail: string,
  recipientName: string,
): Promise<void> {
  const href = `${BASE_URL}/admin/documents/${document.id}`
  const modeLabel = approval.mode === 'formal_acceptance' ? 'Formal Acceptance' : 'Operational Approval'
  const timestamp =
    approval.createdAt &&
    typeof approval.createdAt === 'object' &&
    'toDate' in approval.createdAt &&
    typeof (approval.createdAt as { toDate: () => Date }).toDate === 'function'
      ? (approval.createdAt as { toDate: () => Date }).toDate().toUTCString()
      : new Date().toUTCString()

  const html = emailWrapper(`
    <p style="margin:0 0 8px;color:#16a34a;font-size:13px;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;">✓ Approved</p>
    <h1 style="margin:0 0 20px;font-size:22px;font-weight:700;color:#0A0A0B;">${document.title}</h1>
    <p style="margin:0 0 16px;">Hi ${recipientName},</p>
    <p style="margin:0 0 16px;">
      Great news! <strong>${approval.actorName}</strong> has approved
      <strong>${document.title}</strong>.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"
           style="margin:0 0 20px;width:100%;background:#f9fafb;border-radius:6px;overflow:hidden;">
      <tr>
        <td style="padding:14px 18px;border-bottom:1px solid #e5e7eb;">
          <span style="color:#6b7280;font-size:13px;">Approval mode</span><br>
          <span style="font-weight:600;">${modeLabel}</span>
        </td>
      </tr>
      <tr>
        <td style="padding:14px 18px;border-bottom:1px solid #e5e7eb;">
          <span style="color:#6b7280;font-size:13px;">Approved by</span><br>
          <span style="font-weight:600;">${approval.actorName}${approval.companyName ? ` — ${approval.companyName}` : ''}</span>
        </td>
      </tr>
      <tr>
        <td style="padding:14px 18px;">
          <span style="color:#6b7280;font-size:13px;">Timestamp</span><br>
          <span style="font-weight:600;">${timestamp}</span>
        </td>
      </tr>
    </table>
    ${ctaButton(href, 'View in Admin')}
  `)

  await sendEmail({
    to: recipientEmail,
    subject: `${document.title} — Approved ✓`,
    html,
  })
}
