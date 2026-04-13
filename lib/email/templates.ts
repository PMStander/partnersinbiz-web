// lib/email/templates.ts

function baseTemplate(title: string, content: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
    <body style="margin:0; padding:0; background:#111; font-family:system-ui,-apple-system,sans-serif;">
      <div style="max-width:560px; margin:0 auto; padding:32px 24px;">
        <div style="text-align:center; margin-bottom:24px;">
          <span style="color:#F59E0B; font-size:20px; font-weight:700; letter-spacing:-0.5px;">Partners in Biz</span>
        </div>
        <div style="background:#1A1A1A; border:1px solid rgba(255,255,255,0.06); border-radius:12px; padding:24px;">
          <h2 style="color:#FAFAFA; font-size:16px; margin:0 0 16px 0;">${title}</h2>
          ${content}
        </div>
        <div style="text-align:center; margin-top:24px;">
          <span style="color:rgba(255,255,255,0.3); font-size:12px;">partnersinbiz.online</span>
        </div>
      </div>
    </body>
    </html>
  `
}

export function approvalNeededEmail(postContent: string, orgName: string, portalUrl: string): string {
  return baseTemplate(
    'Social post ready for your review',
    `<p style="color:rgba(255,255,255,0.6); font-size:14px; line-height:1.6; margin:0 0 16px 0;">
      A new post is waiting for your approval for <strong style="color:#FAFAFA;">${orgName}</strong>:
    </p>
    <div style="background:rgba(255,255,255,0.03); border-left:3px solid #F59E0B; padding:12px 16px; border-radius:4px; margin-bottom:16px;">
      <p style="color:rgba(255,255,255,0.8); font-size:13px; margin:0;">${postContent.substring(0, 200)}${postContent.length > 200 ? '...' : ''}</p>
    </div>
    <a href="${portalUrl}" style="display:inline-block; background:#F59E0B; color:#1A1A1A; padding:10px 20px; border-radius:8px; text-decoration:none; font-size:13px; font-weight:600;">
      Review & Approve
    </a>`
  )
}

export function newCommentEmail(commentText: string, commenterName: string, context: string, viewUrl: string): string {
  // context is like "on task 'Fix homepage bug'" or "on social post for ClientName"
  return baseTemplate(
    `New comment ${context}`,
    `<p style="color:rgba(255,255,255,0.6); font-size:14px; line-height:1.6; margin:0 0 16px 0;">
      <strong style="color:#FAFAFA;">${commenterName}</strong> left a comment:
    </p>
    <div style="background:rgba(255,255,255,0.03); border-left:3px solid #F59E0B; padding:12px 16px; border-radius:4px; margin-bottom:16px;">
      <p style="color:rgba(255,255,255,0.8); font-size:13px; margin:0;">"${commentText}"</p>
    </div>
    <a href="${viewUrl}" style="display:inline-block; background:#F59E0B; color:#1A1A1A; padding:10px 20px; border-radius:8px; text-decoration:none; font-size:13px; font-weight:600;">
      View & Reply
    </a>`
  )
}

export function invoiceSentEmail(invoiceNumber: string, total: string, dueDate: string, orgName: string, viewUrl: string): string {
  return baseTemplate(
    `Invoice ${invoiceNumber}`,
    `<p style="color:rgba(255,255,255,0.6); font-size:14px; line-height:1.6; margin:0 0 16px 0;">
      Hi, a new invoice has been issued for <strong style="color:#FAFAFA;">${orgName}</strong>.
    </p>
    <table style="width:100%; margin-bottom:16px;">
      <tr><td style="color:rgba(255,255,255,0.5); font-size:13px; padding:4px 0;">Invoice:</td><td style="color:#FAFAFA; font-size:13px; text-align:right;">${invoiceNumber}</td></tr>
      <tr><td style="color:rgba(255,255,255,0.5); font-size:13px; padding:4px 0;">Amount:</td><td style="color:#F59E0B; font-size:15px; font-weight:600; text-align:right;">${total}</td></tr>
      <tr><td style="color:rgba(255,255,255,0.5); font-size:13px; padding:4px 0;">Due:</td><td style="color:#FAFAFA; font-size:13px; text-align:right;">${dueDate}</td></tr>
    </table>
    <a href="${viewUrl}" style="display:inline-block; background:#F59E0B; color:#1A1A1A; padding:10px 20px; border-radius:8px; text-decoration:none; font-size:13px; font-weight:600;">
      View Invoice
    </a>`
  )
}
