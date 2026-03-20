import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { Resend } from 'resend'
import { FieldValue } from 'firebase-admin/firestore'

const resend = new Resend(process.env.RESEND_API_KEY)

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

const VALID_PROJECT_TYPES = ['web', 'mobile', 'ai', 'design']

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { name, email, company, projectType, details, userId } = body

  if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  if (!email?.trim()) return NextResponse.json({ error: 'Email is required' }, { status: 400 })
  if (!isValidEmail(email)) return NextResponse.json({ error: 'Email is invalid' }, { status: 400 })
  if (!details?.trim()) return NextResponse.json({ error: 'Project details are required' }, { status: 400 })
  if (!projectType || !VALID_PROJECT_TYPES.includes(projectType)) {
    return NextResponse.json({ error: 'Invalid project type' }, { status: 400 })
  }

  const docRef = await adminDb.collection('enquiries').add({
    userId: userId ?? null,
    name: name.trim(),
    email: email.trim().toLowerCase(),
    company: company?.trim() ?? '',
    projectType: projectType,
    details: details.trim(),
    status: 'new',
    createdAt: FieldValue.serverTimestamp(),
    assignedTo: null,
  })

  await resend.emails.send({
    from: process.env.RESEND_FROM_ADDRESS!,
    to: process.env.ADMIN_NOTIFICATION_EMAIL!,
    subject: `New Project Inquiry from ${escapeHtml(name)}`,
    html: `
      <h2>New Project Inquiry</h2>
      <p><strong>Name:</strong> ${escapeHtml(name)}</p>
      <p><strong>Email:</strong> ${escapeHtml(email)}</p>
      <p><strong>Company:</strong> ${escapeHtml(company ?? 'Not provided')}</p>
      <p><strong>Project Type:</strong> ${escapeHtml(projectType)}</p>
      <p><strong>Details:</strong></p>
      <p>${escapeHtml(details)}</p>
      <p><em>Enquiry ID: ${docRef.id}</em></p>
    `,
  })

  return NextResponse.json({ id: docRef.id }, { status: 201 })
}
