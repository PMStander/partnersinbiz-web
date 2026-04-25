import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const ct = req.headers.get('content-type') ?? ''
    let email = ''
    if (ct.includes('application/json')) {
      const body = await req.json().catch(() => ({}))
      email = String(body?.email ?? '').trim().toLowerCase()
    } else {
      const form = await req.formData()
      email = String(form.get('email') ?? '').trim().toLowerCase()
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ ok: false, error: 'Invalid email' }, { status: 400 })
    }

    // TODO wire to Resend audience / Firestore subscribers collection
    console.log('[newsletter] subscribed:', email)

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 })
  }
}
