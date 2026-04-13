// lib/email/send.ts
const RESEND_API_KEY = process.env.RESEND_API_KEY

interface EmailOptions {
  to: string
  subject: string
  html: string
  from?: string
}

export async function sendEmail(options: EmailOptions): Promise<{ success: boolean; error?: string }> {
  if (!RESEND_API_KEY) {
    console.warn('[Email] RESEND_API_KEY not configured, skipping email')
    return { success: false, error: 'Email not configured' }
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: options.from ?? 'Partners in Biz <notifications@partnersinbiz.online>',
        to: options.to,
        subject: options.subject,
        html: options.html,
      }),
    })

    if (!res.ok) {
      const error = await res.text()
      console.error('[Email] Send failed:', error)
      return { success: false, error }
    }

    return { success: true }
  } catch (err: any) {
    console.error('[Email] Send error:', err)
    return { success: false, error: err.message }
  }
}
