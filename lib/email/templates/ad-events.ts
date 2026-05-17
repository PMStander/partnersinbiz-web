/**
 * Email templates for ad lifecycle event notifications.
 * Used by lib/ads/notifications.ts
 */

export function campaignLaunchedEmail(name: string, objective: string, url: string): string {
  return `<!DOCTYPE html>
<html><body style="margin:0;font-family:-apple-system,BlinkMacSystemFont,Inter,Segoe UI,sans-serif;background:#0A0A0B;color:#F7F4EE">
<div style="max-width:560px;margin:0 auto;padding:48px 24px">
  <div style="text-align:center;margin-bottom:32px">
    <span style="font-size:24px;font-weight:600;letter-spacing:-0.02em">Partners in Biz</span>
  </div>
  <div style="background:#141416;border:1px solid #222;border-radius:12px;padding:40px 32px">
    <h1 style="margin:0 0 16px;font-size:20px;font-weight:600;letter-spacing:-0.02em">Campaign launched</h1>
    <p style="margin:0 0 24px;color:#aaa;font-size:14px;line-height:1.6">
      The campaign <strong style="color:#F7F4EE">${escape(name)}</strong> (objective: <em>${escape(objective.toLowerCase())}</em>) is now active in Meta.
    </p>
    <a href="${url}" style="display:inline-block;background:#F5A623;color:#0A0A0B;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;letter-spacing:0.02em">View campaign &rarr;</a>
    <p style="margin:32px 0 0;color:#666;font-size:12px;line-height:1.5">Monitor performance and adjust targeting from the campaign dashboard.</p>
  </div>
  <p style="margin:24px 0 0;text-align:center;color:#444;font-size:12px">Partners in Biz · partnersinbiz.online</p>
</div>
</body></html>`
}

export function campaignPausedEmail(name: string, reason: string, url: string): string {
  return `<!DOCTYPE html>
<html><body style="margin:0;font-family:-apple-system,BlinkMacSystemFont,Inter,Segoe UI,sans-serif;background:#0A0A0B;color:#F7F4EE">
<div style="max-width:560px;margin:0 auto;padding:48px 24px">
  <div style="text-align:center;margin-bottom:32px">
    <span style="font-size:24px;font-weight:600;letter-spacing:-0.02em">Partners in Biz</span>
  </div>
  <div style="background:#141416;border:1px solid #222;border-radius:12px;padding:40px 32px">
    <h1 style="margin:0 0 16px;font-size:20px;font-weight:600;letter-spacing:-0.02em">Campaign paused</h1>
    <p style="margin:0 0 24px;color:#aaa;font-size:14px;line-height:1.6">
      The campaign <strong style="color:#F7F4EE">${escape(name)}</strong> has been paused.
    </p>
    <div style="background:rgba(245,166,35,0.1);border-left:3px solid #F5A623;padding:12px 16px;border-radius:4px;margin-bottom:24px">
      <p style="margin:0;color:#aaa;font-size:13px"><strong>Reason:</strong> ${escape(reason)}</p>
    </div>
    <a href="${url}" style="display:inline-block;background:#F5A623;color:#0A0A0B;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;letter-spacing:0.02em">View campaign &rarr;</a>
    <p style="margin:32px 0 0;color:#666;font-size:12px;line-height:1.5">You can resume the campaign or make adjustments from the dashboard.</p>
  </div>
  <p style="margin:24px 0 0;text-align:center;color:#444;font-size:12px">Partners in Biz · partnersinbiz.online</p>
</div>
</body></html>`
}

export function capiErrorEmail(eventName: string, error: string, url: string): string {
  return `<!DOCTYPE html>
<html><body style="margin:0;font-family:-apple-system,BlinkMacSystemFont,Inter,Segoe UI,sans-serif;background:#0A0A0B;color:#F7F4EE">
<div style="max-width:560px;margin:0 auto;padding:48px 24px">
  <div style="text-align:center;margin-bottom:32px">
    <span style="font-size:24px;font-weight:600;letter-spacing:-0.02em">Partners in Biz</span>
  </div>
  <div style="background:#141416;border:1px solid #222;border-radius:12px;padding:40px 32px">
    <h1 style="margin:0 0 16px;font-size:20px;font-weight:600;letter-spacing:-0.02em;color:#ff6b6b">Conversion API failure</h1>
    <p style="margin:0 0 24px;color:#aaa;font-size:14px;line-height:1.6">
      A CAPI event of type <strong style="color:#F7F4EE">${escape(eventName)}</strong> failed to send to Meta.
    </p>
    <pre style="background:rgba(255,107,107,0.08);border:1px solid rgba(255,107,107,0.2);border-radius:6px;padding:12px;font-size:12px;color:#aaa;overflow-x:auto;white-space:pre-wrap;word-break:break-word;margin:0 0 24px">${escape(error)}</pre>
    <p style="margin:0 0 24px;color:#aaa;font-size:13px">Check the Pixel & CAPI config and verify your access token is still valid.</p>
    <a href="${url}" style="display:inline-block;background:#F5A623;color:#0A0A0B;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;letter-spacing:0.02em">Open Pixel & CAPI &rarr;</a>
  </div>
  <p style="margin:24px 0 0;text-align:center;color:#444;font-size:12px">Partners in Biz · partnersinbiz.online</p>
</div>
</body></html>`
}

/**
 * HTML-escape a string to prevent XSS.
 * Used for user-supplied content in email templates.
 */
function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}
