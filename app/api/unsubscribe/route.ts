import { NextRequest, NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')

  if (!token) {
    return new NextResponse(unsubscribePage('Invalid link', 'No contact token was provided.'), {
      status: 400,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  const docRef = adminDb.collection('contacts').doc(token)
  const doc = await docRef.get()

  if (!doc.exists) {
    return new NextResponse(unsubscribePage('Invalid link', 'We could not find your contact record.'), {
      status: 404,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  if (doc.data()?.unsubscribed) {
    return new NextResponse(
      unsubscribePage('Already unsubscribed', 'You are already unsubscribed from our emails.'),
      { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    )
  }

  await docRef.update({
    unsubscribed: true,
    unsubscribedAt: FieldValue.serverTimestamp(),
  })

  return new NextResponse(
    unsubscribePage(
      'You\'ve been unsubscribed',
      'You have been successfully removed from our email list. You will no longer receive emails from Partners in Biz.'
    ),
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  )
}

function unsubscribePage(heading: string, message: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${heading} — Partners in Biz</title>
</head>
<body style="margin:0;padding:0;background:#111;font-family:system-ui,-apple-system,sans-serif;">
  <div style="max-width:480px;margin:80px auto;padding:0 24px;text-align:center;">
    <div style="margin-bottom:32px;">
      <span style="color:#F59E0B;font-size:20px;font-weight:700;letter-spacing:-0.5px;">Partners in Biz</span>
    </div>
    <div style="background:#1A1A1A;border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:32px 24px;">
      <h1 style="color:#FAFAFA;font-size:18px;font-weight:600;margin:0 0 12px 0;">${heading}</h1>
      <p style="color:rgba(255,255,255,0.5);font-size:14px;line-height:1.6;margin:0;">${message}</p>
    </div>
    <p style="color:rgba(255,255,255,0.2);font-size:12px;margin-top:24px;">partnersinbiz.online</p>
  </div>
</body>
</html>`
}
