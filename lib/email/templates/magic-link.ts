export interface MagicLinkEmailInput {
  signInUrl: string
  docTitle?: string
}

export interface MagicLinkEmailOutput {
  subject: string
  html: string
  text: string
}

export function buildMagicLinkEmail({ signInUrl, docTitle }: MagicLinkEmailInput): MagicLinkEmailOutput {
  const docLine = docTitle ? `to review <strong>${escapeHtml(docTitle)}</strong>` : 'to continue'
  const subject = docTitle
    ? `Sign in to review ${docTitle} — Partners in Biz`
    : 'Sign in to Partners in Biz'

  const html = `<!doctype html>
<html><body style="margin:0;font-family:-apple-system,BlinkMacSystemFont,Inter,Segoe UI,sans-serif;background:#0A0A0B;color:#F7F4EE">
<div style="max-width:560px;margin:0 auto;padding:48px 24px">
  <div style="text-align:center;margin-bottom:32px">
    <span style="font-size:24px;font-weight:600;letter-spacing:-0.02em">Partners in Biz</span>
  </div>
  <div style="background:#141416;border:1px solid #222;border-radius:12px;padding:40px 32px">
    <h1 style="margin:0 0 16px;font-size:24px;font-weight:600;letter-spacing:-0.02em">Sign in</h1>
    <p style="margin:0 0 24px;color:#aaa;font-size:15px;line-height:1.6">Tap the button below ${docLine}. The link expires in 15 minutes and can only be used once.</p>
    <a href="${signInUrl}" style="display:inline-block;background:#F5A623;color:#0A0A0B;font-weight:600;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:14px;letter-spacing:0.02em">Sign in &rarr;</a>
    <p style="margin:32px 0 0;color:#666;font-size:13px;line-height:1.5">If you didn't request this, ignore the email — no action is needed.</p>
  </div>
  <p style="margin:24px 0 0;text-align:center;color:#444;font-size:12px">Partners in Biz · partnersinbiz.online</p>
</div>
</body></html>`

  const text = `Sign in to Partners in Biz ${docTitle ? `to review ${docTitle} ` : ''}

Open this link to sign in (expires in 15 minutes):
${signInUrl}

If you didn't request this, ignore the email.`

  return { subject, html, text }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
