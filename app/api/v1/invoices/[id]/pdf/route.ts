import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { apiError } from '@/lib/api/response'
import { generateInvoiceHtml } from '@/lib/invoices/html-generator'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

// Public endpoint — anyone with the URL can view/download the invoice PDF
export async function GET(req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params

  try {
    // Fetch invoice document
    const invoiceDoc = await adminDb.collection('invoices').doc(id).get()
    if (!invoiceDoc.exists) {
      return apiError('Invoice not found', 404)
    }

    const invoiceData = invoiceDoc.data() as Record<string, any>
    const invoice = { id: invoiceDoc.id, ...invoiceData }

    // Fetch organization details for branding
    let orgName = 'Partners in Biz'
    let orgLogo = ''

    if (invoiceData?.orgId) {
      const orgDoc = await adminDb.collection('organizations').doc(invoiceData.orgId).get()
      if (orgDoc.exists) {
        const orgData = orgDoc.data()
        orgName = orgData?.name ?? orgName
        orgLogo = orgData?.brandProfile?.logoUrl ?? orgData?.logoUrl ?? ''
      }
    }

    // Generate HTML
    const html = generateInvoiceHtml(invoice)

    // Return as HTML with proper headers for PDF download
    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `inline; filename="${invoiceData.invoiceNumber}.html"`,
      },
    })
  } catch (error) {
    console.error('[invoices/pdf] Error:', error)
    return apiError('Failed to generate invoice PDF', 500)
  }
}
