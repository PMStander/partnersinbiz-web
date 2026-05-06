import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { FieldValue } from 'firebase-admin/firestore'
import { getResendClient, FROM_ADDRESS } from '@/lib/email/resend'
import { PIB_PLATFORM_ORG_ID } from '@/lib/platform/constants'

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

const VALID_PROJECT_TYPES = ['web', 'mobile', 'design', 'marketing', 'seo', 'branding', 'other'] as const

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { name, email, company, projectType, details, userId } = body

  if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  if (!email?.trim()) return NextResponse.json({ error: 'Email is required' }, { status: 400 })
  if (!isValidEmail(email)) return NextResponse.json({ error: 'Email is invalid' }, { status: 400 })
  if (!details?.trim()) return NextResponse.json({ error: 'Project details are required' }, { status: 400 })
  if (!projectType?.trim()) return NextResponse.json({ error: 'Project type is required' }, { status: 400 })
  if (!VALID_PROJECT_TYPES.includes(projectType)) return NextResponse.json({ error: 'Invalid project type' }, { status: 400 })

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

  // Also create a CRM contact for this lead — scoped to the PIB platform org
  // (PIB-internal enquiries land in the platform-owner org's CRM).
  await adminDb.collection('contacts').add({
    orgId: PIB_PLATFORM_ORG_ID,
    capturedFromId: '',
    name: name.trim(),
    email: email.trim().toLowerCase(),
    company: company?.trim() ?? '',
    phone: '',
    website: '',
    source: 'form',
    type: 'lead',
    stage: 'new',
    tags: ['enquiry'],
    notes: `Enquiry ID: ${docRef.id}`,
    assignedTo: '',
    deleted: false,
    subscribedAt: FieldValue.serverTimestamp(),
    unsubscribedAt: null,
    bouncedAt: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    lastContactedAt: null,
  })

  // Notification email — fire-and-forget; failure must not break form submission
  try {
    const adminEmail = process.env.ADMIN_EMAIL || 'peet.stander@partnersinbiz.online'
    await getResendClient().emails.send({
      from: FROM_ADDRESS,
      to: adminEmail,
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
  } catch (err) {
    // Log but do not fail the request
    console.error('[enquiries] notification email failed:', err)
  }

  return NextResponse.json({ id: docRef.id }, { status: 201 })
}
