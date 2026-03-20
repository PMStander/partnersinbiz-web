import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { Resend } from 'resend'
import { FieldValue } from 'firebase-admin/firestore'

const resend = new Resend(process.env.RESEND_API_KEY)

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { name, email, company, projectType, details, userId } = body

  if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  if (!email?.trim()) return NextResponse.json({ error: 'Email is required' }, { status: 400 })
  if (!isValidEmail(email)) return NextResponse.json({ error: 'Email is invalid' }, { status: 400 })
  if (!details?.trim()) return NextResponse.json({ error: 'Project details are required' }, { status: 400 })

  const docRef = await adminDb.collection('enquiries').add({
    userId: userId ?? null,
    name: name.trim(),
    email: email.trim().toLowerCase(),
    company: company?.trim() ?? '',
    projectType: projectType ?? 'web',
    details: details.trim(),
    status: 'new',
    createdAt: FieldValue.serverTimestamp(),
    assignedTo: null,
  })

  await resend.emails.send({
    from: process.env.RESEND_FROM_ADDRESS!,
    to: process.env.ADMIN_NOTIFICATION_EMAIL!,
    subject: `New Project Inquiry from ${name}`,
    html: `
      <h2>New Project Inquiry</h2>
      <p><strong>Name:</strong> ${name}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Company:</strong> ${company ?? 'Not provided'}</p>
      <p><strong>Project Type:</strong> ${projectType}</p>
      <p><strong>Details:</strong></p>
      <p>${details}</p>
      <p><em>Enquiry ID: ${docRef.id}</em></p>
    `,
  })

  return NextResponse.json({ id: docRef.id }, { status: 201 })
}
